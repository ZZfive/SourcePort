import type {
  OperationDescriptor,
  RegisteredOperation,
  SourceAdapter,
  SourceManifest,
} from "./adapter.js";

export type SourceRegistryErrorCode =
  | "duplicate_source"
  | "duplicate_operation"
  | "source_mismatch"
  | "unsupported_source"
  | "unsupported_operation";

export class SourceRegistryError extends Error {
  readonly code: SourceRegistryErrorCode;

  constructor(code: SourceRegistryErrorCode, message: string) {
    super(message);
    this.name = "SourceRegistryError";
    this.code = code;
  }
}

interface RegisteredSource {
  adapter: SourceAdapter;
  manifest: Readonly<SourceManifest>;
  operations: Map<string, Readonly<OperationDescriptor>>;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) {
      deepFreeze(Reflect.get(value, key));
    }
    Object.freeze(value);
  }
  return value;
}

function immutableCopy<T>(value: T): Readonly<T> {
  return deepFreeze(structuredClone(value));
}

export class SourceRegistry {
  readonly #sources = new Map<string, RegisteredSource>();

  register(adapter: SourceAdapter): void {
    const sourceManifest = adapter.manifest();
    if (this.#sources.has(sourceManifest.source)) {
      throw new SourceRegistryError(
        "duplicate_source",
        `source '${sourceManifest.source}' is already registered`,
      );
    }

    const operations = new Map<string, Readonly<OperationDescriptor>>();
    for (const descriptor of adapter.operations()) {
      if (descriptor.source !== sourceManifest.source) {
        throw new SourceRegistryError(
          "source_mismatch",
          `operation '${descriptor.operation}' claims source '${descriptor.source}' instead of '${sourceManifest.source}'`,
        );
      }
      if (operations.has(descriptor.operation)) {
        throw new SourceRegistryError(
          "duplicate_operation",
          `operation '${sourceManifest.source}.${descriptor.operation}' is duplicated`,
        );
      }
      operations.set(descriptor.operation, immutableCopy(descriptor));
    }

    this.#sources.set(sourceManifest.source, {
      adapter,
      manifest: immutableCopy(sourceManifest),
      operations,
    });
  }

  listSources(): Readonly<SourceManifest>[] {
    return [...this.#sources.values()]
      .map((registered) => registered.manifest)
      .sort((left, right) => left.source.localeCompare(right.source));
  }

  listCapabilities(source: string): Readonly<OperationDescriptor>[] {
    const registered = this.#source(source);
    return [...registered.operations.values()].sort((left, right) =>
      left.operation.localeCompare(right.operation),
    );
  }

  getOperation(source: string, operation: string): RegisteredOperation {
    const registered = this.#source(source);
    const descriptor = registered.operations.get(operation);
    if (!descriptor) {
      throw new SourceRegistryError(
        "unsupported_operation",
        `operation '${source}.${operation}' is not registered`,
      );
    }
    return { adapter: registered.adapter, descriptor };
  }

  #source(source: string): RegisteredSource {
    const registered = this.#sources.get(source);
    if (!registered) {
      throw new SourceRegistryError("unsupported_source", `source '${source}' is not registered`);
    }
    return registered;
  }
}
