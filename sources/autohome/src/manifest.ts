import type { OperationDescriptor, SourceManifest } from "@sourceport/core";

export const autohomeManifest: SourceManifest = {
  source: "autohome",
  displayName: "汽车之家",
  version: "0.1.0",
  description: "Stable public catalog and owner-score acquisition from Autohome",
};

const backend = (name: string): OperationDescriptor["backends"] => [
  { name, kind: "public-http", priority: 0 },
  { name: "autohome-manual", kind: "manual-step", priority: 1 },
];

export const listBrandSeriesOperation: OperationDescriptor = {
  source: "autohome",
  operation: "list-brand-series",
  description: "List stable Autohome series identities and guide prices for a brand",
  access: "read",
  schemaVersion: "1.0.0",
  parametersSchema: {
    type: "object",
    additionalProperties: false,
    required: ["brand"],
    properties: {
      brand: { type: "string", minLength: 1, maxLength: 40 },
      limit: { type: "integer", minimum: 1, maximum: 120, default: 60 },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["brand", "items"],
    properties: {
      brand: { type: "string", minLength: 1 },
      items: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["seriesId", "name", "guidePrice", "sourceUrl"],
          properties: {
            seriesId: { type: "string", pattern: "^[0-9]+$" },
            name: { type: "string", minLength: 1 },
            guidePrice: { type: "string" },
            sourceUrl: { type: "string", minLength: 1 },
          },
        },
      },
    },
  },
  backends: backend("autohome-brand-public"),
  auth: "none",
  freshnessClass: "periodic",
};

export const getSeriesScoreOperation: OperationDescriptor = {
  source: "autohome",
  operation: "get-series-score",
  description: "Get aggregate owner score, dimensions, reliability, and competitors",
  access: "read",
  schemaVersion: "1.0.0",
  parametersSchema: {
    type: "object",
    additionalProperties: false,
    required: ["seriesId"],
    properties: {
      seriesId: { type: "string", pattern: "^[0-9]+$" },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: [
      "seriesId",
      "name",
      "brand",
      "level",
      "guidePrice",
      "overallScore",
      "dimensions",
      "reliability",
      "competitors",
      "sourceUrl",
    ],
    properties: {
      seriesId: { type: "string", pattern: "^[0-9]+$" },
      name: { type: "string", minLength: 1 },
      brand: { type: "string" },
      level: { type: "string" },
      guidePrice: { type: "string" },
      overallScore: { anyOf: [{ type: "number" }, { type: "null" }] },
      dimensions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "score"],
          properties: {
            name: { type: "string", minLength: 1 },
            score: { anyOf: [{ type: "number" }, { type: "null" }] },
          },
        },
      },
      reliability: {
        type: "object",
        additionalProperties: false,
        required: ["pph", "reviewUsers"],
        properties: {
          pph: { anyOf: [{ type: "number" }, { type: "null" }] },
          reviewUsers: { anyOf: [{ type: "number" }, { type: "null" }] },
        },
      },
      competitors: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["seriesId", "name", "score"],
          properties: {
            seriesId: { type: "string", pattern: "^[0-9]+$" },
            name: { type: "string", minLength: 1 },
            score: { anyOf: [{ type: "number" }, { type: "null" }] },
          },
        },
      },
      sourceUrl: { type: "string", minLength: 1 },
    },
  },
  backends: backend("autohome-score-public"),
  auth: "none",
  freshnessClass: "periodic",
};
