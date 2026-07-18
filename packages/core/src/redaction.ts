import type { SourceFailure } from "./contracts.js";
import { createFailure } from "./failures.js";

const REDACTED = "[REDACTED]";

export interface RedactionResult {
  value: unknown;
  redactedPaths: string[];
}

export type ArtifactSanitizationResult =
  | { ok: true; value: unknown; redactedPaths: string[] }
  | { ok: false; failure: SourceFailure };

function normalizedKey(key: string): string {
  return key.replaceAll(/[-_\s]/g, "").toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizedKey(key);
  return (
    normalized === "authorization" ||
    normalized === "proxyauthorization" ||
    normalized.includes("cookie") ||
    normalized.endsWith("token") ||
    normalized === "accountid" ||
    normalized === "sessionid" ||
    normalized === "openid"
  );
}

function redactValue(
  value: unknown,
  path: string,
  activeObjects: WeakSet<object>,
  redactedPaths: string[],
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    if (activeObjects.has(value)) {
      throw new TypeError("artifact contains a cycle");
    }
    activeObjects.add(value);
    const result = value.map((item, index) =>
      redactValue(item, path ? `${path}.${index}` : String(index), activeObjects, redactedPaths),
    );
    activeObjects.delete(value);
    return result;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("artifact contains a non-plain object");
    }
    if (activeObjects.has(value)) {
      throw new TypeError("artifact contains a cycle");
    }
    activeObjects.add(value);
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const itemPath = path ? `${path}.${key}` : key;
      if (isSensitiveKey(key)) {
        output[key] = REDACTED;
        redactedPaths.push(itemPath);
      } else {
        output[key] = redactValue(item, itemPath, activeObjects, redactedPaths);
      }
    }
    activeObjects.delete(value);
    return output;
  }
  throw new TypeError(`artifact contains unsupported value type '${typeof value}'`);
}

export function redactSensitive(value: unknown): RedactionResult {
  const redactedPaths: string[] = [];
  return {
    value: redactValue(value, "", new WeakSet<object>(), redactedPaths),
    redactedPaths,
  };
}

export function sanitizeArtifact(value: unknown): ArtifactSanitizationResult {
  try {
    const redacted = redactSensitive(value);
    const serialized = JSON.stringify(redacted.value);
    if (serialized === undefined) {
      throw new TypeError("artifact is not JSON serializable");
    }
    return {
      ok: true,
      value: JSON.parse(serialized) as unknown,
      redactedPaths: redacted.redactedPaths,
    };
  } catch (error) {
    return {
      ok: false,
      failure: createFailure(
        "evidence_requirement_unmet",
        error instanceof Error ? error.message : "artifact sanitization failed",
        "evidence",
        false,
      ),
    };
  }
}
