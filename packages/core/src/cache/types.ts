import type { SourceResult } from "../contracts.js";

export interface CacheKeyInput {
  source: string;
  operation: string;
  parameters: unknown;
  operationSchemaVersion: string;
}

export type CacheMissReason = "not_found" | "corrupt";

export type CacheReadResult =
  | {
      status: "hit";
      keyHash: string;
      storedAt: string;
      result: SourceResult;
    }
  | {
      status: "miss";
      reason: CacheMissReason;
      message?: string;
    };

export interface ResultCache {
  read(key: CacheKeyInput): Promise<CacheReadResult>;
  write(key: CacheKeyInput, result: SourceResult): Promise<void>;
}
