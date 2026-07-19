import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import {
  createEvidenceRecord,
  createFailure,
  humanVerificationRecovery,
  loginRecovery,
  type Backend,
  type BackendExecutionContext,
  type SourceResult,
} from "@sourceport/core";

import {
  classifyDongchediSearchPage,
  parseDongchediSearchPage,
} from "./search-series.js";
import {
  classifyDongchediTrimsPage,
  parseDongchediTrimsPage,
  type DongchediTrimStatus,
} from "./list-trims.js";
import {
  classifyDongchediTrimConfigurationPage,
  parseDongchediTrimConfiguration,
} from "./get-trim-configuration.js";

interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export type OpenCliProcessRunner = (
  command: string,
  args: string[],
  signal: AbortSignal,
) => Promise<ProcessResult>;

async function defaultRunner(
  command: string,
  args: string[],
  signal: AbortSignal,
): Promise<ProcessResult> {
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

function failed(
  context: BackendExecutionContext,
  code: "backend_unavailable" | "auth_required" | "human_verification_required" | "source_drift",
  message: string,
): SourceResult {
  const recoveryActions = code === "auth_required"
    ? [loginRecovery("Log in to Dongchedi in the connected Chrome profile", "dongchedi-browser")]
    : code === "human_verification_required"
      ? [humanVerificationRecovery("Complete Dongchedi verification in the connected Chrome profile")]
      : [];
  return {
    requestId: context.request.requestId ?? randomUUID(),
    source: context.request.source,
    operation: context.request.operation,
    operationSchemaVersion: context.operation.schemaVersion,
    status: code === "auth_required" || code === "human_verification_required" ? "blocked" : "failed",
    backend: "dongchedi-browser",
    evidence: [],
    warnings: [],
    failure: createFailure(code, message, code === "source_drift" ? "parsing" : "transport", false, "dongchedi-browser"),
    recoveryActions,
  };
}

export interface DongchediBrowserBackendOptions {
  command?: string;
  session?: string;
  run?: OpenCliProcessRunner;
}

export class DongchediBrowserBackend implements Backend {
  readonly name = "dongchedi-browser";
  readonly kind = "browser-session" as const;
  readonly #command: string;
  readonly #session: string;
  readonly #run: OpenCliProcessRunner;

  constructor(options: DongchediBrowserBackendOptions = {}) {
    this.#command = options.command ?? "opencli";
    this.#session = options.session ?? "sourceport-dongchedi";
    this.#run = options.run ?? defaultRunner;
  }

  async execute(context: BackendExecutionContext): Promise<SourceResult> {
    const route = this.#route(context);
    if (!route) {
      return failed(
        context,
        "source_drift",
        `Dongchedi browser backend does not support '${context.request.operation}'`,
      );
    }
    const { requestedUrl } = route;
    try {
      const opened = await this.#run(
        this.#command,
        ["browser", this.#session, "open", requestedUrl],
        context.signal,
      );
      if (opened.exitCode !== 0) {
        const detail = `${opened.stderr}\n${opened.stdout}`.trim();
        return failed(
          context,
          "backend_unavailable",
          detail.includes("extension")
            ? "OpenCLI Browser Bridge extension is not connected"
            : `OpenCLI browser open failed: ${detail.slice(0, 500)}`,
        );
      }

      const browserState = await this.#run(
        this.#command,
        [
          "browser",
          this.#session,
          "eval",
          `JSON.stringify({url:location.href,title:document.title,nextData:document.querySelector('script#__NEXT_DATA__')?.textContent??null,bodyText:(document.body?.innerText??'').slice(0,2000)})`,
        ],
        context.signal,
      );
      if (browserState.exitCode !== 0) {
        return failed(
          context,
          "backend_unavailable",
          `OpenCLI browser eval failed: ${`${browserState.stderr}\n${browserState.stdout}`.trim().slice(0, 500)}`,
        );
      }
      const state = JSON.parse(browserState.stdout) as {
        url?: unknown;
        nextData?: unknown;
        bodyText?: unknown;
      };
      const html = state.nextData
        ? `<script id="__NEXT_DATA__">${String(state.nextData)}</script>`
        : String(state.bodyText ?? "");
      const classification = route.classify(html);
      if (classification) {
        return failed(
          context,
          classification.code === "auth_required"
            ? "auth_required"
            : classification.code === "human_verification_required"
              ? "human_verification_required"
              : "source_drift",
          classification.message,
        );
      }
      let data: unknown;
      try {
        data = route.parse(html);
      } catch (error) {
        return failed(
          context,
          "source_drift",
          error instanceof Error ? error.message : "Dongchedi parser failed",
        );
      }
      const retrievedAt = new Date().toISOString();
      const sourceUrl = typeof state.url === "string" ? state.url : requestedUrl;
      return {
        requestId: context.request.requestId ?? randomUUID(),
        source: context.request.source,
        operation: context.request.operation,
        operationSchemaVersion: context.operation.schemaVersion,
        status: "success",
        data,
        backend: this.name,
        retrievedAt,
        freshness: { isLive: true, ageMs: 0 },
        evidence: [
          createEvidenceRecord({
            source: context.request.source,
            operation: context.request.operation,
            backend: this.name,
            retrievedAt,
            sourceUrl,
            fragment: data,
            verification: "source-verified",
          }),
        ],
        warnings: [],
        recoveryActions: [],
      };
    } catch (error) {
      return failed(
        context,
        "backend_unavailable",
        error instanceof Error ? error.message : "OpenCLI browser backend failed",
      );
    }
  }

  #route(context: BackendExecutionContext): {
    requestedUrl: string;
    classify(html: string): ReturnType<typeof classifyDongchediSearchPage>;
    parse(html: string): unknown;
  } | undefined {
    if (context.request.operation === "search-series") {
      const parameters = context.request.parameters as { keyword: string; limit?: number };
      return {
        requestedUrl: `https://www.dongchedi.com/search?keyword=${encodeURIComponent(parameters.keyword)}`,
        classify: classifyDongchediSearchPage,
        parse: (html) => {
          const data = parseDongchediSearchPage(html, parameters.limit ?? 15);
          if (data.items.length === 0) {
            throw new Error("Dongchedi browser page exposed no car-series rows");
          }
          return data;
        },
      };
    }
    if (context.request.operation === "list-trims") {
      const parameters = context.request.parameters as {
        seriesId: string;
        status?: DongchediTrimStatus;
      };
      return {
        requestedUrl: `https://www.dongchedi.com/auto/series/${parameters.seriesId}`,
        classify: classifyDongchediTrimsPage,
        parse: (html) => {
          const data = parseDongchediTrimsPage(
            html,
            parameters.seriesId,
            parameters.status ?? "online",
          );
          if (data.items.length === 0) {
            throw new Error("Dongchedi browser page exposed no matching trims");
          }
          return data;
        },
      };
    }
    if (context.request.operation === "get-trim-configuration") {
      const parameters = context.request.parameters as { trimId: string };
      return {
        requestedUrl: `https://www.dongchedi.com/auto/params-carIds-${parameters.trimId}`,
        classify: classifyDongchediTrimConfigurationPage,
        parse: (html) => parseDongchediTrimConfiguration(html, parameters.trimId),
      };
    }
    return undefined;
  }
}
