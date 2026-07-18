import type { AnySchema } from "ajv";

export const sourceRequestSchema: AnySchema = {
  type: "object",
  additionalProperties: false,
  required: ["source", "operation", "parameters"],
  properties: {
    requestId: { type: "string", minLength: 1 },
    source: { type: "string", minLength: 1 },
    operation: { type: "string", minLength: 1 },
    parameters: {},
    operationSchemaVersion: { type: "string", minLength: 1 },
    preferredBackends: {
      type: "array",
      items: { type: "string", minLength: 1 },
      uniqueItems: true,
    },
    freshness: {
      type: "object",
      additionalProperties: false,
      required: ["mode"],
      properties: {
        mode: { enum: ["live", "prefer-live", "allow-stale"] },
        maxAgeMs: { type: "integer", minimum: 0 },
      },
    },
    evidence: {
      type: "object",
      additionalProperties: false,
      required: ["minimum"],
      properties: {
        includeRawArtifact: { type: "boolean" },
        minimum: { enum: ["provenance", "source-fragment", "raw-artifact"] },
      },
    },
    execution: {
      type: "object",
      additionalProperties: false,
      properties: {
        timeoutMs: { type: "integer", minimum: 1 },
        retryBudget: { type: "integer", minimum: 0 },
        allowHumanAssistance: { type: "boolean" },
      },
    },
  },
};
