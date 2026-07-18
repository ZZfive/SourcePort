import type { OperationDescriptor } from "../adapter.js";
import type { SourceRequest, SourceResult } from "../contracts.js";

export interface BackendExecutionContext {
  request: SourceRequest;
  operation: Readonly<OperationDescriptor>;
  signal: AbortSignal;
  attempt: number;
}

export interface Backend {
  name: string;
  kind: "public-http" | "opencli" | "browser-session" | "manual-step";
  execute(context: BackendExecutionContext): Promise<SourceResult>;
}
