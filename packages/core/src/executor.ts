import { FileCache } from "./cache/file-cache.js";
import type { ResultCache } from "./cache/types.js";
import type { SourceRequest, SourceResult } from "./contracts.js";
import { executeWithFreshness } from "./freshness.js";
import type { SourceRegistry } from "./registry.js";

export type SourceExecutor = (request: SourceRequest) => Promise<SourceResult>;

export function createRegistrySourceExecutor(options: {
  registry: SourceRegistry;
  cache?: ResultCache;
  now?: () => Date;
}): SourceExecutor {
  const cache = options.cache ?? new FileCache();
  const now = options.now ?? (() => new Date());
  return async (request) => {
    const registered = options.registry.getOperation(request.source, request.operation);
    return executeWithFreshness({
      request,
      operation: registered.descriptor,
      cache,
      executeLive: (liveRequest) => registered.adapter.execute(liveRequest, {
        signal: new AbortController().signal,
        now,
      }),
      now,
    });
  };
}
