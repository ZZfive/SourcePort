import { randomUUID } from "node:crypto";

import type { SourceResult } from "../contracts.js";
import { createFailure, humanVerificationRecovery } from "../failures.js";
import type { Backend, BackendExecutionContext } from "./types.js";

export interface ManualStepBackendOptions {
  name: string;
  description: string;
}

export class ManualStepBackend implements Backend {
  readonly kind = "manual-step" as const;
  readonly name: string;
  readonly #description: string;

  constructor(options: ManualStepBackendOptions) {
    this.name = options.name;
    this.#description = options.description;
  }

  async execute(context: BackendExecutionContext): Promise<SourceResult> {
    const resumeToken = randomUUID();
    return {
      requestId: context.request.requestId ?? randomUUID(),
      source: context.request.source,
      operation: context.request.operation,
      operationSchemaVersion: context.operation.schemaVersion,
      status: "blocked",
      backend: this.name,
      evidence: [],
      warnings: [],
      failure: createFailure(
        "human_verification_required",
        this.#description,
        "transport",
        false,
        this.name,
      ),
      recoveryActions: [humanVerificationRecovery(this.#description, resumeToken)],
    };
  }
}
