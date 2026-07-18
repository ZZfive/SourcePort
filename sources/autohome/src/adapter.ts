import { randomUUID } from "node:crypto";

import {
  BackendRouter,
  createFailure,
  humanVerificationRecovery,
  ManualStepBackend,
  PublicHttpBackend,
  type OperationDescriptor,
  type SourceAdapter,
  type SourceRequest,
  type SourceResult,
  type SourceRuntime,
  validateSourceRequest,
} from "@sourceport/core";

import { parseAutohomeSeriesScore } from "./get-series-score.js";
import { parseAutohomeBrandSeries, resolveBrandInitial } from "./list-brand-series.js";
import {
  autohomeManifest,
  getSeriesScoreOperation,
  listBrandSeriesOperation,
} from "./manifest.js";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface BrandParameters {
  brand: string;
  limit?: number;
}

interface ScoreParameters {
  seriesId: string;
}

function blockedPage(body: string) {
  return /captcha|安全验证|访问验证|verify/i.test(body)
    ? {
        status: "blocked" as const,
        code: "human_verification_required" as const,
        message: "Autohome requires interactive access verification",
        recoveryActions: [humanVerificationRecovery("Complete Autohome verification in a browser")],
      }
    : undefined;
}

function failure(request: SourceRequest, descriptor: OperationDescriptor, code: "invalid_request" | "unsupported_operation", message: string): SourceResult {
  return {
    requestId: request.requestId ?? randomUUID(),
    source: request.source,
    operation: request.operation,
    operationSchemaVersion: descriptor.schemaVersion,
    status: "failed",
    evidence: [],
    warnings: [],
    failure: createFailure(code, message, "validation"),
    recoveryActions: [],
  };
}

export class AutohomeAdapter implements SourceAdapter {
  readonly #router: BackendRouter;

  constructor(fetch?: FetchLike) {
    const common = {
      init: () => ({
        redirect: "follow" as const,
        headers: {
          "User-Agent": USER_AGENT,
          Referer: "https://www.autohome.com.cn/",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
      }),
      ...(fetch ? { fetch } : {}),
      classify: ({ body }: { body: string }) => blockedPage(body),
      classifyError: ({ error }: { error: unknown }) => ({
        status: "failed" as const,
        code: "source_drift" as const,
        message: error instanceof Error ? error.message : "Autohome parser failed",
      }),
    };
    const brand = new PublicHttpBackend({
      name: "autohome-brand-public",
      ...common,
      request: ({ request }) => {
        const parameters = request.parameters as BrandParameters;
        return `https://www.autohome.com.cn/grade/carhtml/${resolveBrandInitial(parameters.brand)}.html`;
      },
      parse: ({ body, context }) => {
        const parameters = context.request.parameters as BrandParameters;
        const items = parseAutohomeBrandSeries(body, parameters.brand, parameters.limit ?? 60);
        if (items.length === 0) {
          throw new Error(`Autohome returned no series for brand '${parameters.brand}'`);
        }
        return { brand: parameters.brand, items };
      },
    });
    const score = new PublicHttpBackend({
      name: "autohome-score-public",
      ...common,
      request: ({ request }) => {
        const parameters = request.parameters as ScoreParameters;
        return `https://k.autohome.com.cn/${parameters.seriesId}`;
      },
      parse: ({ body, context }) => {
        const parameters = context.request.parameters as ScoreParameters;
        const data = parseAutohomeSeriesScore(body, parameters.seriesId);
        if (!data.name || data.overallScore === null) {
          throw new Error("Autohome score page lacked stable series identity or aggregate score");
        }
        return data;
      },
    });
    this.#router = new BackendRouter([
      brand,
      score,
      new ManualStepBackend({
        name: "autohome-manual",
        description: "Complete Autohome access verification, then retry",
      }),
    ]);
  }

  manifest() {
    return autohomeManifest;
  }

  operations() {
    return [listBrandSeriesOperation, getSeriesScoreOperation];
  }

  async execute(request: SourceRequest, _runtime: SourceRuntime): Promise<SourceResult> {
    const descriptor = this.operations().find((candidate) => candidate.operation === request.operation);
    if (!descriptor) {
      return failure(request, listBrandSeriesOperation, "unsupported_operation", `Unsupported operation '${request.operation}'`);
    }
    const validation = validateSourceRequest(request, descriptor.parametersSchema);
    if (!validation.ok) {
      return {
        ...failure(request, descriptor, "invalid_request", validation.failure.message),
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
}
