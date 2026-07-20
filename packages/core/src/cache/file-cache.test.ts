import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { SourceResult } from "../contracts.js";
import { buildCacheKey, FileCache } from "./file-cache.js";
import type { CacheKeyInput } from "./types.js";

const directories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "sourceport-cache-"));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function key(parameters: unknown = { market: "武汉", value: "x" }): CacheKeyInput {
  return {
    source: "fake",
    operation: "echo",
    parameters,
    operationSchemaVersion: "1.0.0",
  };
}

function liveResult(value = "x"): SourceResult {
  return {
    requestId: `request-${value}`,
    source: "fake",
    operation: "echo",
    operationSchemaVersion: "1.0.0",
    status: "success",
    data: { value },
    backend: "fixture",
    retrievedAt: "2026-07-20T00:00:00.000Z",
    freshness: { isLive: true, ageMs: 0 },
    evidence: [{
      id: `evidence-${value}`,
      source: "fake",
      operation: "echo",
      backend: "fixture",
      retrievedAt: "2026-07-20T00:00:00.000Z",
      verification: "source-verified",
    }],
    warnings: [],
    recoveryActions: [],
  };
}

describe("cache keys", () => {
  it("normalizes object key order", () => {
    expect(buildCacheKey(key({ market: "武汉", nested: { b: 2, a: 1 } }))).toBe(
      buildCacheKey(key({ nested: { a: 1, b: 2 }, market: "武汉" })),
    );
  });

  it("separates market parameters and schema versions", () => {
    expect(buildCacheKey(key({ market: "武汉" }))).not.toBe(buildCacheKey(key({ market: "上海" })));
    expect(buildCacheKey(key())).not.toBe(buildCacheKey({ ...key(), operationSchemaVersion: "2.0.0" }));
  });

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY])("rejects non-JSON values: %s", (value) => {
    expect(() => buildCacheKey(key({ value }))).toThrow(TypeError);
  });

  it("rejects cyclic parameters", () => {
    const value: Record<string, unknown> = {};
    value["self"] = value;
    expect(() => buildCacheKey(key(value))).toThrow("cyclic");
  });
});

describe("FileCache", () => {
  it("writes and reads a validated result", async () => {
    const cache = new FileCache({ directory: await temporaryDirectory() });
    await cache.write(key(), liveResult());

    const read = await cache.read(key());
    expect(read.status).toBe("hit");
    if (read.status === "hit") {
      expect(read.result.data).toEqual({ value: "x" });
      expect(read.result.retrievedAt).toBe("2026-07-20T00:00:00.000Z");
    }
  });

  it("rejects corrupted cache files safely", async () => {
    const directory = await temporaryDirectory();
    const cache = new FileCache({ directory });
    const cacheKey = key();
    await writeFile(join(directory, `${buildCacheKey(cacheKey)}.json`), "not-json", "utf8");

    await expect(cache.read(cacheKey)).resolves.toEqual(expect.objectContaining({
      status: "miss",
      reason: "corrupt",
    }));
  });

  it("uses atomic files during concurrent writes", async () => {
    const directory = await temporaryDirectory();
    const cache = new FileCache({ directory });
    await Promise.all([
      cache.write(key(), liveResult("first")),
      cache.write(key(), liveResult("second")),
    ]);

    const read = await cache.read(key());
    expect(read.status).toBe("hit");
    if (read.status === "hit") {
      expect(["first", "second"]).toContain((read.result.data as { value: string }).value);
    }
    expect((await readdir(directory)).every((name) => name.endsWith(".json"))).toBe(true);
  });

  it("refuses to persist stale or failed results", async () => {
    const cache = new FileCache({ directory: await temporaryDirectory() });
    const stale = { ...liveResult(), status: "stale" as const, freshness: { isLive: false } };
    await expect(cache.write(key(), stale)).rejects.toThrow("validated live");
  });
});
