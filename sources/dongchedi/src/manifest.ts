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

const browserBackends: OperationDescriptor["backends"] = [
  { name: "dongchedi-browser", kind: "browser-session", priority: 0 },
  { name: "dongchedi-manual", kind: "manual-step", priority: 1 },
];

export const listTrimsOperation: OperationDescriptor = {
  source: "dongchedi",
  operation: "list-trims",
  description: "List exact on-sale or discontinued trims for a Dongchedi series",
  access: "read",
  schemaVersion: "1.0.0",
  parametersSchema: {
    type: "object",
    additionalProperties: false,
    required: ["seriesId"],
    properties: {
      seriesId: { type: "string", pattern: "^[1-9][0-9]*$" },
      status: { type: "string", enum: ["online", "offline"], default: "online" },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["seriesId", "status", "items"],
    properties: {
      seriesId: { type: "string", pattern: "^[1-9][0-9]*$" },
      status: { type: "string", enum: ["online", "offline"] },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "trimId",
            "name",
            "year",
            "officialPrice",
            "dealerPrice",
            "ownerPrice",
            "sourceUrl",
            "configurationUrl",
          ],
          properties: {
            trimId: { type: "string", pattern: "^[1-9][0-9]*$" },
            name: { type: "string", minLength: 1 },
            year: { type: "string" },
            officialPrice: { type: "string" },
            dealerPrice: { type: "string" },
            ownerPrice: { type: "string" },
            sourceUrl: { type: "string", minLength: 1 },
            configurationUrl: { type: "string", minLength: 1 },
          },
        },
      },
    },
  },
  backends: browserBackends,
  auth: "human-assisted",
  freshnessClass: "live",
};

export const getTrimConfigurationOperation: OperationDescriptor = {
  source: "dongchedi",
  operation: "get-trim-configuration",
  description: "Retrieve detailed configuration and driving-assistance evidence for one exact trim",
  access: "read",
  schemaVersion: "1.0.0",
  parametersSchema: {
    type: "object",
    additionalProperties: false,
    required: ["trimId"],
    properties: {
      trimId: { type: "string", pattern: "^[1-9][0-9]*$" },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["identity", "configuration", "drivingAssistance"],
    properties: {
      identity: {
        type: "object",
        additionalProperties: false,
        required: ["seriesId", "trimId", "trimName", "year", "sourceUrl"],
        properties: {
          seriesId: { type: "string", pattern: "^[1-9][0-9]*$" },
          seriesName: { type: "string" },
          trimId: { type: "string", pattern: "^[1-9][0-9]*$" },
          trimName: { type: "string", minLength: 1 },
          year: { type: "string" },
          brand: { type: "string" },
          officialPrice: { type: "string" },
          dealerPrice: { type: "string" },
          sourceUrl: { type: "string", minLength: 1 },
        },
      },
      configuration: { type: "array", items: { type: "object" } },
      drivingAssistance: {
        type: "object",
        additionalProperties: false,
        required: [
          "claimedAutomationLevel",
          "operatingDomains",
          "capabilities",
          "hardware",
          "system",
          "optionalEquipment",
          "optionalPackages",
          "subscription",
          "ota",
          "market",
        ],
        properties: {
          claimedAutomationLevel: {
            anyOf: [{ type: "object" }, { type: "null" }],
          },
          operatingDomains: { type: "object" },
          capabilities: { type: "object" },
          hardware: { type: "object" },
          system: { type: "object" },
          optionalEquipment: { type: "array", items: { type: "object" } },
          optionalPackages: { type: "array", items: { type: "object" } },
          subscription: { anyOf: [{ type: "string" }, { type: "null" }] },
          ota: { anyOf: [{ type: "string" }, { type: "null" }] },
          market: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
      },
    },
  },
  backends: browserBackends,
  auth: "human-assisted",
  freshnessClass: "live",
};
