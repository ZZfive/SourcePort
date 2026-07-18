import { randomUUID } from "node:crypto";

import { createEvidenceRecord } from "../evidence.js";
import { createFailure } from "../failures.js";
import type {
  RecoveryAction,
  SourceFailureCode,
  SourceFailureStage,
  SourceResult,
  SourceWarning,
} from "../contracts.js";
import type { Backend, BackendExecutionContext } from "./types.js";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface PublicHttpBackendOptions<T> {
  name: string;
  request(context: BackendExecutionContext): string | URL | Request;
  init?(context: BackendExecutionContext): RequestInit;
  parse(input: {
    response: Response;
    body: string;
    context: BackendExecutionContext;
  }): Promise<T> | T;
  classify?(input: {
    response: Response;
    body: string;
    context: BackendExecutionContext;
  }): PublicHttpClassification | undefined;
  classifyError?(input: {
    error: unknown;
    response: Response;
    body: string;
    context: BackendExecutionContext;
  }): PublicHttpClassification | undefined;
  fetch?: FetchLike;
}

export interface PublicHttpClassification {
  status: "blocked" | "failed";
  code: SourceFailureCode;
  message: string;
  stage?: SourceFailureStage;
  retryable?: boolean;
  warnings?: SourceWarning[];
  recoveryActions?: RecoveryAction[];
}

function requestUrl(request: string | URL | Request): string {
  if (typeof request === "string") {
    return request;
  }
  return request instanceof URL ? request.toString() : request.url;
}

export class PublicHttpBackend<T = unknown> implements Backend {
  readonly kind = "public-http" as const;
  readonly name: string;
  readonly #options: PublicHttpBackendOptions<T>;

  constructor(options: PublicHttpBackendOptions<T>) {
    this.name = options.name;
    this.#options = options;
  }

  async execute(context: BackendExecutionContext): Promise<SourceResult<T>> {
    const target = this.#options.request(context);
    const url = requestUrl(target);
    const retrievedAt = new Date().toISOString();
    try {
      const response = await (this.#options.fetch ?? fetch)(target, {
        ...this.#options.init?.(context),
        signal: context.signal,
      });
      const body = await response.text();
      const classification = this.#options.classify?.({ response, body, context });
      if (classification) {
        return this.#classifiedResult(context, classification);
      }
      if (!response.ok) {
        const code = response.status === 429 ? "rate_limited" : response.status === 401 || response.status === 403 ? "access_blocked" : "network_error";
        return {
          requestId: context.request.requestId ?? randomUUID(),
          source: context.request.source,
          operation: context.request.operation,
          operationSchemaVersion: context.operation.schemaVersion,
          status: "failed",
          backend: this.name,
          evidence: [],
          warnings: [],
          failure: createFailure(code, `HTTP ${response.status}`, "transport", undefined, this.name),
          recoveryActions: [],
        };
      }
      let data: T;
      try {
        data = await this.#options.parse({ response, body, context });
      } catch (error) {
        const parseClassification = this.#options.classifyError?.({
          error,
          response,
          body,
          context,
        });
        if (parseClassification) {
          return this.#classifiedResult(context, parseClassification);
        }
        throw error;
      }
      const evidence = createEvidenceRecord({
        source: context.request.source,
        operation: context.request.operation,
        backend: this.name,
        retrievedAt,
        sourceUrl: response.url || url,
        fragment: data,
        verification: "source-verified",
      });
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
        evidence: [evidence],
        warnings: [],
        recoveryActions: [],
      };
    } catch (error) {
      const code = context.signal.aborted ? "timeout" : "network_error";
      return {
        requestId: context.request.requestId ?? randomUUID(),
        source: context.request.source,
        operation: context.request.operation,
        operationSchemaVersion: context.operation.schemaVersion,
        status: "failed",
        backend: this.name,
        evidence: [],
        warnings: [],
        failure: createFailure(
          code,
          error instanceof Error ? error.message : "public HTTP backend failed",
          "transport",
          undefined,
          this.name,
        ),
        recoveryActions: [],
      };
    }
  }

  #classifiedResult(
    context: BackendExecutionContext,
    classification: PublicHttpClassification,
  ): SourceResult<T> {
    return {
      requestId: context.request.requestId ?? randomUUID(),
      source: context.request.source,
      operation: context.request.operation,
      operationSchemaVersion: context.operation.schemaVersion,
      status: classification.status,
      backend: this.name,
      evidence: [],
      warnings: classification.warnings ?? [],
      failure: createFailure(
        classification.code,
        classification.message,
        classification.stage ?? "classification",
        classification.retryable,
        this.name,
      ),
      recoveryActions: classification.recoveryActions ?? [],
    };
  }
}
