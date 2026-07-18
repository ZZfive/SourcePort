import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import type { SourceResult } from "../contracts.js";
import { createEvidenceRecord } from "../evidence.js";
import { createFailure } from "../failures.js";
import type { Backend, BackendExecutionContext } from "./types.js";

export interface OpenCliBackendOptions {
  name: string;
  command?: string;
  args(context: BackendExecutionContext): string[];
}

interface ProcessOutput {
  exitCode: number | null;
  stdout: string;
  stderr: string;
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
        this.#options.args(context),
        context.signal,
      );
      if (output.exitCode !== 0) {
        return {
          requestId,
          source: context.request.source,
          operation: context.request.operation,
          operationSchemaVersion: context.operation.schemaVersion,
          status: "failed",
          backend: this.name,
          evidence: [],
          warnings: output.stderr
            ? [{ code: "backend_stderr", message: output.stderr.trim().slice(0, 500) }]
            : [],
          failure: createFailure(
            "backend_unavailable",
            `OpenCLI exited with code ${String(output.exitCode)}`,
            "transport",
            true,
            this.name,
          ),
          recoveryActions: [],
        };
      }

      let data: unknown;
      try {
        data = JSON.parse(output.stdout) as unknown;
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
            "OpenCLI output was not valid JSON",
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
        recoveryActions: [],
      };
    }
  }
}
