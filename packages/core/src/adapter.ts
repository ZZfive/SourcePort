import type { AnySchema } from "ajv";

import type { SourceRequest, SourceResult } from "./contracts.js";

export interface SourceManifest {
  source: string;
  displayName: string;
  version: string;
  description?: string;
}

export interface BackendDescriptor {
  name: string;
  kind: "public-http" | "opencli" | "browser-session" | "manual-step";
  priority: number;
}

export interface OperationDescriptor {
  source: string;
  operation: string;
  description: string;
  access: "read" | "write";
  schemaVersion: string;
  parametersSchema: AnySchema;
  outputSchema: AnySchema;
  backends: readonly BackendDescriptor[];
  auth: "none" | "optional" | "required" | "human-assisted";
  freshnessClass: "live" | "volatile" | "periodic" | "historical";
}

export interface SourceRuntime {
  readonly signal: AbortSignal;
  now(): Date;
}

export interface SourceAdapter {
  manifest(): SourceManifest;
  operations(): readonly OperationDescriptor[];
  execute(request: SourceRequest, runtime: SourceRuntime): Promise<SourceResult>;
}

export interface RegisteredOperation {
  adapter: SourceAdapter;
  descriptor: Readonly<OperationDescriptor>;
}
