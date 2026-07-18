import type { OperationDescriptor, SourceManifest } from "@sourceport/core";

export const dongchediManifest: SourceManifest = {
  source: "dongchedi",
  displayName: "懂车帝",
  version: "0.1.0",
  description: "Stable, evidence-preserving access to selected Dongchedi operations",
};

export const searchSeriesOperation: OperationDescriptor = {
  source: "dongchedi",
  operation: "search-series",
  description: "Search Dongchedi car series by keyword",
  access: "read",
  schemaVersion: "1.0.0",
  parametersSchema: {
    type: "object",
    additionalProperties: false,
    required: ["keyword"],
    properties: {
      keyword: { type: "string", minLength: 1, maxLength: 80 },
      limit: { type: "integer", minimum: 1, maximum: 30, default: 15 },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["total", "items"],
    properties: {
      total: { type: "integer", minimum: 0 },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "rank",
            "seriesId",
            "name",
            "brand",
            "officialPrice",
            "dealerPrice",
            "pictureCount",
            "sourceUrl",
          ],
          properties: {
            rank: { type: "integer", minimum: 1 },
            seriesId: { type: "string", pattern: "^[1-9][0-9]*$" },
            name: { type: "string", minLength: 1 },
            brand: { type: "string" },
            officialPrice: { type: "string" },
            dealerPrice: { type: "string" },
            pictureCount: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] },
            sourceUrl: { type: "string", minLength: 1 },
          },
        },
      },
    },
  },
  backends: [
    { name: "dongchedi-public", kind: "public-http", priority: 0 },
    { name: "dongchedi-browser", kind: "browser-session", priority: 1 },
    { name: "dongchedi-manual", kind: "manual-step", priority: 2 },
  ],
  auth: "human-assisted",
  freshnessClass: "live",
};
