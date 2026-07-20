import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";

import type { SourceResult } from "../contracts.js";
import { validateSourceResult } from "../invariants.js";
import type { CacheKeyInput, CacheReadResult, ResultCache } from "./types.js";

const CACHE_FORMAT_VERSION = 1;

interface FileCacheEnvelope {
  formatVersion: number;
  keyHash: string;
  storedAt: string;
  result: SourceResult;
}

export interface FileCacheOptions {
  directory?: string;
  now?: () => Date;
}

function canonicalize(value: unknown, seen: Set<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("cache keys require finite JSON numbers");
    }
    return value;
  }
  if (typeof value !== "object") {
    throw new TypeError(`cache keys cannot contain ${typeof value}`);
  }
  if (seen.has(value)) {
    throw new TypeError("cache keys cannot contain cyclic values");
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => canonicalize(item, seen));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("cache keys require plain JSON objects");
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError("cache keys cannot contain symbol properties");
    }
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = canonicalize((value as Record<string, unknown>)[key], seen);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value, new Set()));
}

export function buildCacheKey(input: CacheKeyInput): string {
  for (const [name, value] of [
    ["source", input.source],
    ["operation", input.operation],
    ["operationSchemaVersion", input.operationSchemaVersion],
  ] as const) {
    if (value.length === 0) {
      throw new TypeError(`cache key ${name} must not be empty`);
    }
  }
  return createHash("sha256")
    .update(canonicalJson({
      source: input.source,
      operation: input.operation,
      parameters: input.parameters,
      operationSchemaVersion: input.operationSchemaVersion,
    }))
    .digest("hex");
}

export function defaultCacheDirectory(environment: NodeJS.ProcessEnv = process.env): string {
  if (environment["SOURCEPORT_CACHE_DIR"]) {
    return resolve(environment["SOURCEPORT_CACHE_DIR"]);
  }
  if (platform() === "darwin") {
    return join(homedir(), "Library", "Caches", "SourcePort", "results");
  }
  if (platform() === "win32") {
    return join(environment["LOCALAPPDATA"] ?? join(homedir(), "AppData", "Local"), "SourcePort", "Cache", "results");
  }
  return join(environment["XDG_CACHE_HOME"] ?? join(homedir(), ".cache"), "sourceport", "results");
}

function cacheable(result: SourceResult): boolean {
  if (result.status !== "success" && result.status !== "partial") {
    return false;
  }
  return result.data !== undefined &&
    result.retrievedAt !== undefined &&
    result.evidence.length > 0 &&
    result.freshness?.isLive === true &&
    validateSourceResult(result).ok;
}

function isEnvelope(value: unknown): value is FileCacheEnvelope {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const envelope = value as Partial<FileCacheEnvelope>;
  return envelope.formatVersion === CACHE_FORMAT_VERSION &&
    typeof envelope.keyHash === "string" &&
    typeof envelope.storedAt === "string" &&
    envelope.result !== undefined &&
    envelope.result !== null &&
    typeof envelope.result === "object";
}

function corrupt(message: string): CacheReadResult {
  return { status: "miss", reason: "corrupt", message };
}

export class FileCache implements ResultCache {
  readonly #directory: string;
  readonly #now: () => Date;

  constructor(options: FileCacheOptions = {}) {
    this.#directory = options.directory ?? defaultCacheDirectory();
    this.#now = options.now ?? (() => new Date());
  }

  async read(key: CacheKeyInput): Promise<CacheReadResult> {
    const keyHash = buildCacheKey(key);
    const path = this.#path(keyHash);
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { status: "miss", reason: "not_found" };
      }
      return corrupt(error instanceof Error ? error.message : "cache file could not be read");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return corrupt("cache file is not valid JSON");
    }
    if (!isEnvelope(parsed)) {
      return corrupt("cache envelope is invalid");
    }
    if (parsed.keyHash !== keyHash) {
      return corrupt("cache key hash does not match its file name");
    }
    if (Number.isNaN(Date.parse(parsed.storedAt))) {
      return corrupt("cache storedAt is invalid");
    }
    const result = parsed.result;
    if (!cacheable(result)) {
      return corrupt("cached SourceResult is not a cacheable live result");
    }
    if (
      result.source !== key.source ||
      result.operation !== key.operation ||
      result.operationSchemaVersion !== key.operationSchemaVersion
    ) {
      return corrupt("cached SourceResult identity does not match the requested key");
    }
    return { status: "hit", keyHash, storedAt: parsed.storedAt, result };
  }

  async write(key: CacheKeyInput, result: SourceResult): Promise<void> {
    if (!cacheable(result)) {
      throw new TypeError("only validated live success or partial results can be cached");
    }
    if (
      result.source !== key.source ||
      result.operation !== key.operation ||
      result.operationSchemaVersion !== key.operationSchemaVersion
    ) {
      throw new TypeError("cached SourceResult identity must match the cache key");
    }
    const keyHash = buildCacheKey(key);
    const path = this.#path(keyHash);
    const temporary = join(dirname(path), `.${keyHash}.${process.pid}.${randomUUID()}.tmp`);
    const envelope: FileCacheEnvelope = {
      formatVersion: CACHE_FORMAT_VERSION,
      keyHash,
      storedAt: this.#now().toISOString(),
      result,
    };
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(temporary, `${JSON.stringify(envelope)}\n`, { encoding: "utf8", flag: "wx" });
      await rename(temporary, path);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  #path(keyHash: string): string {
    return join(this.#directory, `${keyHash}.json`);
  }
}
