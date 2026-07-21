import { randomUUID } from "node:crypto";

import {
  aggregateSourceHealth,
  BackendRouter,
  createFailure,
  ManualStepBackend,
  PublicHttpBackend,
  probeOperationHealth,
  skippedBackendHealth,
  type OperationDescriptor,
  type SourceAdapter,
  type SourceRequest,
  type SourceResult,
  type BackendHealth,
  type SourceHealthRuntime,
  type SourceRuntime,
  unconfiguredBackendHealth,
  validateSourceRequest,
} from "@sourceport/core";

import {
  dongchediManifest,
  getTrimConfigurationOperation,
  listTrimsOperation,
  searchSeriesOperation,
} from "./manifest.js";
import {
  DongchediBrowserBackend,
  type OpenCliProcessRunner,
} from "./browser-backend.js";
import {
  classifyDongchediSearchPage,
  parseDongchediSearchPage,
  type DongchediSeriesSearchData,
} from "./search-series.js";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface DongchediAdapterOptions {
  fetch?: FetchLike;
  openCliCommand?: string;
  browserRun?: OpenCliProcessRunner;
}

interface SearchParameters {
  keyword: string;
  limit?: number;
}

function failureResult(
  request: SourceRequest,
  descriptor: OperationDescriptor | undefined,
  code: "invalid_request" | "unsupported_operation",
  message: string,
): SourceResult {
  return {
    requestId: request.requestId ?? randomUUID(),
    source: request.source,
    operation: request.operation,
    operationSchemaVersion: descriptor?.schemaVersion ?? request.operationSchemaVersion ?? "unknown",
    status: "failed",
    evidence: [],
    warnings: [],
    failure: createFailure(code, message, "validation"),
    recoveryActions: [],
  };
}

export class DongchediAdapter implements SourceAdapter {
  readonly #router: BackendRouter;
  readonly #browserBackend: DongchediBrowserBackend;

  constructor(options: DongchediAdapterOptions = {}) {
    const publicBackend = new PublicHttpBackend<DongchediSeriesSearchData>({
      name: "dongchedi-public",
      request: ({ request }) => {
        const parameters = request.parameters as SearchParameters;
        return `https://www.dongchedi.com/search?keyword=${encodeURIComponent(parameters.keyword)}`;
      },
      init: () => ({
        redirect: "follow",
        headers: {
          "User-Agent": USER_AGENT,
          Referer: "https://www.dongchedi.com/",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
      }),
      ...(options.fetch ? { fetch: options.fetch } : {}),
      classify: ({ body }) => classifyDongchediSearchPage(body),
      classifyError: ({ error }) => ({
        status: "failed",
        code: "source_drift",
        message: error instanceof Error ? error.message : "Dongchedi search parser failed",
      }),
      parse: ({ body, context }) => {
        const parameters = context.request.parameters as SearchParameters;
        const data = parseDongchediSearchPage(body, parameters.limit ?? 15);
        if (data.items.length === 0) {
          throw new Error("Dongchedi returned no car-series rows for this keyword");
        }
        return data;
      },
    });
    this.#browserBackend = new DongchediBrowserBackend({
      ...(options.openCliCommand ? { command: options.openCliCommand } : {}),
      ...(options.browserRun ? { run: options.browserRun } : {}),
    });
    this.#router = new BackendRouter([
      publicBackend,
      this.#browserBackend,
      new ManualStepBackend({
        name: "dongchedi-manual",
        description: "Log in to Dongchedi or complete access verification, then retry",
      }),
    ]);
  }

  manifest() {
    return dongchediManifest;
  }

  operations() {
    return [searchSeriesOperation, listTrimsOperation, getTrimConfigurationOperation];
  }

  async execute(request: SourceRequest, _runtime: SourceRuntime): Promise<SourceResult> {
    const descriptor = this.operations().find(
      (candidate) => candidate.operation === request.operation,
    );
    if (!descriptor) {
      return failureResult(
        request,
        undefined,
        "unsupported_operation",
        `Unsupported operation '${request.operation}'`,
      );
    }
    const validation = validateSourceRequest(request, descriptor.parametersSchema);
    if (!validation.ok) {
      return {
        ...failureResult(request, descriptor, "invalid_request", validation.failure.message),
        failure: validation.failure,
        warnings: validation.issues.map((issue) => ({
          code: "validation_issue",
          message: issue.message,
          field: issue.path,
        })),
      };
    }
    return this.#router.execute(validation.value, descriptor);
  }

  async health(runtime: SourceHealthRuntime) {
    const startedAt = runtime.now();
    const checkedAt = startedAt.toISOString();
    const configurationStartedAt = runtime.now();
    const configurationIssue = await this.#browserBackend.configuration(runtime.signal);
    const configurationDurationMs = Math.max(
      0,
      runtime.now().getTime() - configurationStartedAt.getTime(),
    );
    let blockedBrowser: BackendHealth | undefined;
    const probes = [
      { operation: searchSeriesOperation, parameters: { keyword: "宝马X5", limit: 1 } },
      { operation: listTrimsOperation, parameters: { seriesId: "5273", status: "online" } },
      { operation: getTrimConfigurationOperation, parameters: { trimId: "255925" } },
    ] as const;
    const operations = [];
    for (const probe of probes) {
      const operationHealth = await probeOperationHealth({
        operation: probe.operation,
        router: this.#router,
        parameters: probe.parameters,
        runtime,
        overrideBackend: (descriptor, circuit) => {
          if (descriptor.name !== this.#browserBackend.name) {
            return undefined;
          }
          if (configurationIssue) {
            return unconfiguredBackendHealth({
              source: probe.operation.source,
              operation: probe.operation.operation,
              descriptor,
              checkedAt: runtime.now().toISOString(),
              issue: configurationIssue,
              durationMs: configurationDurationMs,
              circuit,
            });
          }
          if (blockedBrowser) {
            return skippedBackendHealth({
              source: probe.operation.source,
              operation: probe.operation.operation,
              descriptor,
              checkedAt: runtime.now().toISOString(),
              state: "blocked",
              ...(blockedBrowser.issueCode ? { issueCode: blockedBrowser.issueCode } : {}),
              message: "browser probe skipped after an earlier Dongchedi login or verification block",
              recoveryActions: blockedBrowser.recoveryActions,
              circuit,
            });
          }
          return undefined;
        },
      });
      operations.push(operationHealth);
      const browser = operationHealth.backends.find((backend) => backend.backend === this.#browserBackend.name);
      if (browser?.state === "blocked") {
        blockedBrowser = browser;
      }
    }
    return aggregateSourceHealth({
      source: dongchediManifest.source,
      displayName: dongchediManifest.displayName,
      checkedAt,
      durationMs: Math.max(0, runtime.now().getTime() - startedAt.getTime()),
      operations,
    });
  }
}
