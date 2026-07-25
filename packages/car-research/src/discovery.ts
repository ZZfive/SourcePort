import {
  executeWithFreshness,
  FileCache,
  type ResultCache,
  type SourceRegistry,
} from "@sourceport/core";

import type { SourceExecutor } from "./contracts.js";

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
