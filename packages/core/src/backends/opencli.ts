import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import type { SourceResult } from "../contracts.js";
import { createEvidenceRecord } from "../evidence.js";
import {
  createFailure,
  humanVerificationRecovery,
  loginRecovery,
  retryRecovery,
} from "../failures.js";
import type { Backend, BackendExecutionContext } from "./types.js";

export interface OpenCliBackendOptions {
  name: string;
  command?: string;
  args(context: BackendExecutionContext): string[];
  jsonOutput?: boolean;
  parse?(data: unknown, context: BackendExecutionContext): unknown;
}

interface ProcessOutput {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

interface OpenCliFailureClassification {
  status: "blocked" | "failed";
  code:
    | "auth_required"
    | "human_verification_required"
    | "rate_limited"
    | "empty_source_result"
    | "source_drift"
    | "backend_unavailable";
  message: string;
}

function yamlField(text: string, field: string): string | undefined {
  const match = text.match(new RegExp(`^\\s*${field}:\\s*(.+?)\\s*$`, "mi"));
  return match?.[1]?.replace(/^['"]|['"]$/g, "").trim();
}

export function classifyOpenCliFailure(output: ProcessOutput): OpenCliFailureClassification {
  const combined = `${output.stderr}\n${output.stdout}`.trim();
  const code = (yamlField(combined, "code") ?? "").toUpperCase();
  const message = yamlField(combined, "message") ??
    (combined.slice(0, 500) || `OpenCLI exited with code ${String(output.exitCode)}`);
  const searchable = `${code} ${message}`.toLowerCase();

  if (/auth_required|login required|requires login|请登录|登录后/.test(searchable)) {
    return { status: "blocked", code: "auth_required", message };
  }
  if (/captcha|human_verification|security_block|安全限制|安全验证|访问验证/.test(searchable)) {
    return { status: "blocked", code: "human_verification_required", message };
  }
  if (/rate.?limit|too many requests|限流|频率/.test(searchable)) {
    return { status: "failed", code: "rate_limited", message };
  }
  if (/no_data|empty_result|no results|not found|笔记不存在|页面不见了/.test(searchable)) {
    return { status: "failed", code: "empty_source_result", message };
  }
  if (/parse_error|selector|unexpected.*shape|source.*drift|结构/.test(searchable)) {
    return { status: "failed", code: "source_drift", message };
  }
  return { status: "failed", code: "backend_unavailable", message };
}

async function runProcess(
  command: string,
  args: string[],
  signal: AbortSignal,
): Promise<ProcessOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      signal,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

export class OpenCliBackend implements Backend {
  readonly kind = "opencli" as const;
  readonly name: string;
  readonly #options: OpenCliBackendOptions;

  constructor(options: OpenCliBackendOptions) {
    this.name = options.name;
    this.#options = options;
  }

  async execute(context: BackendExecutionContext): Promise<SourceResult> {
    const requestId = context.request.requestId ?? randomUUID();
    const retrievedAt = new Date().toISOString();
    try {
      const output = await runProcess(
        this.#options.command ?? "opencli",
        [
          ...this.#options.args(context),
          ...(this.#options.jsonOutput ? ["-f", "json"] : []),
        ],
        context.signal,
      );
      if (output.exitCode !== 0) {
        const classification = classifyOpenCliFailure(output);
        const recoveryActions = classification.code === "auth_required"
          ? [loginRecovery("Log in to the OpenCLI browser session and retry", this.name)]
          : classification.code === "human_verification_required"
            ? [humanVerificationRecovery("Complete the source verification in the OpenCLI browser session")]
            : classification.code === "rate_limited"
              ? [retryRecovery("Retry after the source rate limit resets")]
              : classification.code === "backend_unavailable"
                ? [{
                    kind: "reconfigure" as const,
                    description: "Restore the OpenCLI daemon/browser connection and retry",
                    requiresUser: true,
                    backend: this.name,
                  }]
                : classification.code === "source_drift"
                  ? [{
                      kind: "report_source_drift" as const,
                      description: "Update the OpenCLI operation adapter for the changed source shape",
                      requiresUser: false,
                      backend: this.name,
                    }]
                : [];
        return {
          requestId,
          source: context.request.source,
          operation: context.request.operation,
          operationSchemaVersion: context.operation.schemaVersion,
          status: classification.status,
          backend: this.name,
          evidence: [],
          warnings: output.stderr
            ? [{ code: "backend_stderr", message: output.stderr.trim().slice(0, 500) }]
            : [],
          failure: createFailure(
            classification.code,
            classification.message,
            "transport",
            undefined,
            this.name,
          ),
          recoveryActions,
        };
      }

      let data: unknown;
      try {
        const parsed = JSON.parse(output.stdout) as unknown;
        data = this.#options.parse ? this.#options.parse(parsed, context) : parsed;
      } catch {
        return {
          requestId,
          source: context.request.source,
          operation: context.request.operation,
          operationSchemaVersion: context.operation.schemaVersion,
          status: "failed",
          backend: this.name,
          evidence: [],
          warnings: [],
          failure: createFailure(
            "unexpected_source_shape",
            "OpenCLI output was not valid JSON or failed operation normalization",
            "parsing",
            false,
            this.name,
          ),
          recoveryActions: [],
        };
      }

      const evidence = createEvidenceRecord({
        source: context.request.source,
        operation: context.request.operation,
        backend: this.name,
        retrievedAt,
        fragment: data,
        verification: "source-verified",
      });
      return {
        requestId,
        source: context.request.source,
        operation: context.request.operation,
        operationSchemaVersion: context.operation.schemaVersion,
        status: "success",
        data,
        backend: this.name,
        retrievedAt,
        freshness: { isLive: true, ageMs: 0 },
        evidence: [evidence],
        warnings: [],
        recoveryActions: [],
      };
    } catch (error) {
      const code = context.signal.aborted ? "timeout" : "backend_unavailable";
      return {
        requestId,
        source: context.request.source,
        operation: context.request.operation,
        operationSchemaVersion: context.operation.schemaVersion,
        status: "failed",
        backend: this.name,
        evidence: [],
        warnings: [],
        failure: createFailure(
          code,
          error instanceof Error ? error.message : "OpenCLI backend failed",
          "transport",
          undefined,
          this.name,
        ),
        recoveryActions: code === "timeout"
          ? [retryRecovery("Retry the OpenCLI operation with a new execution budget")]
          : [{
              kind: "reconfigure",
              description: "Restore the OpenCLI executable, daemon, or browser connection and retry",
              requiresUser: true,
              backend: this.name,
            }],
      };
    }
  }
}
