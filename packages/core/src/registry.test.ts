import { describe, expect, it } from "vitest";

import type { OperationDescriptor, SourceAdapter, SourceManifest, SourceRuntime } from "./adapter.js";
import type { SourceRequest, SourceResult } from "./contracts.js";
import { SourceRegistry, SourceRegistryError } from "./registry.js";

const manifest = (source: string): SourceManifest => ({
  source,
  displayName: source.toUpperCase(),
  version: "0.0.0",
});

const operation = (source: string, name: string): OperationDescriptor => ({
  source,
  operation: name,
  description: `${source}.${name}`,
  access: "read",
  schemaVersion: "1.0.0",
  parametersSchema: {
    type: "object",
    additionalProperties: false,
    properties: {},
  },
  outputSchema: {
    type: "object",
  },
  backends: [{ name: "fixture", kind: "public-http", priority: 0 }],
  auth: "none",
  freshnessClass: "live",
});

const adapter = (source: string, operationNames: string[]): SourceAdapter => ({
  manifest: () => manifest(source),
  operations: () => operationNames.map((name) => operation(source, name)),
  execute: async (request: SourceRequest, _runtime: SourceRuntime): Promise<SourceResult> => ({
    requestId: request.requestId ?? "generated",
    source,
    operation: request.operation,
    operationSchemaVersion: "1.0.0",
    status: "blocked",
    evidence: [],
    warnings: [],
    failure: {
      code: "backend_unavailable",
      message: "fixture adapter does not execute",
      stage: "selection",
      retryable: false,
    },
    recoveryActions: [],
  }),
});

describe("SourceRegistry", () => {
  it("registers sources and returns them in deterministic order", () => {
    const registry = new SourceRegistry();
    registry.register(adapter("zeta", ["search"]));
    registry.register(adapter("alpha", ["detail"]));

    expect(registry.listSources().map((entry) => entry.source)).toEqual(["alpha", "zeta"]);
  });

  it("returns source capabilities sorted by operation name", () => {
    const registry = new SourceRegistry();
    registry.register(adapter("fake", ["search", "detail", "comments"]));

    expect(registry.listCapabilities("fake").map((entry) => entry.operation)).toEqual([
      "comments",
      "detail",
      "search",
    ]);
  });

  it("looks up a registered operation and its adapter", () => {
    const fake = adapter("fake", ["echo"]);
    const registry = new SourceRegistry();
    registry.register(fake);

    const registered = registry.getOperation("fake", "echo");

    expect(registered.adapter).toBe(fake);
    expect(registered.descriptor.operation).toBe("echo");
  });

  it("rejects duplicate source registration", () => {
    const registry = new SourceRegistry();
    registry.register(adapter("fake", ["echo"]));

    expect(() => registry.register(adapter("fake", ["detail"]))).toThrowError(
      expect.objectContaining({ code: "duplicate_source" }),
    );
  });

  it("rejects duplicate operations within a source", () => {
    const registry = new SourceRegistry();

    expect(() => registry.register(adapter("fake", ["echo", "echo"]))).toThrowError(
      expect.objectContaining({ code: "duplicate_operation" }),
    );
  });

  it("rejects operation descriptors that claim another source", () => {
    const badAdapter = adapter("fake", ["echo"]);
    const mismatched: SourceAdapter = {
      ...badAdapter,
      operations: () => [operation("other", "echo")],
    };
    const registry = new SourceRegistry();

    expect(() => registry.register(mismatched)).toThrowError(
      expect.objectContaining({ code: "source_mismatch" }),
    );
  });

  it("returns deeply frozen capability descriptors", () => {
    const registry = new SourceRegistry();
    registry.register(adapter("fake", ["echo"]));

    const descriptor = registry.getOperation("fake", "echo").descriptor;

    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(Object.isFrozen(descriptor.backends)).toBe(true);
    expect(Object.isFrozen(descriptor.backends[0])).toBe(true);
    expect(() => {
      Object.defineProperty(descriptor.backends[0], "priority", { value: 99 });
    }).toThrow(TypeError);
  });

  it("reports unsupported sources with a machine-readable error", () => {
    const registry = new SourceRegistry();

    expect(() => registry.listCapabilities("missing")).toThrowError(
      expect.objectContaining({ code: "unsupported_source" }),
    );
  });

  it("reports unsupported operations with a machine-readable error", () => {
    const registry = new SourceRegistry();
    registry.register(adapter("fake", ["echo"]));

    expect(() => registry.getOperation("fake", "missing")).toThrowError(
      expect.objectContaining({ code: "unsupported_operation" }),
    );
  });

  it("uses the registry error type for registration and lookup failures", () => {
    const error = new SourceRegistryError("unsupported_source", "missing");

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("unsupported_source");
  });
});
