import { describe, expect, it } from "vitest";
import { detectMarketEvent, freshness, type VehicleSnapshot } from "./index.js";
const base: VehicleSnapshot = { id:"s1", seriesId:"series1", brand:"A", series:"X", capturedAt:"2026-09-01T00:00:00Z", validUntil:"2026-10-01T00:00:00Z", fields:{price:120000, adas:"L2"}, sourceEvidenceIds:["e1"] };
describe("market intelligence", () => { it("detects field changes", () => { const event=detectMarketEvent(base,{...base,id:"s2",capturedAt:"2026-09-06T00:00:00Z",fields:{...base.fields,price:110000}})!; expect(event.kind).toBe("price-change"); expect(event.changes[0]?.before).toBe(120000); }); it("classifies freshness",()=>expect(freshness(base,new Date("2026-09-06T00:00:00Z"))).toBe("fresh")); });
