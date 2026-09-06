import { describe, expect, it } from "vitest";
import { clusterFeedback, feedbackSignal, normalize12365Complaints, type FeedbackRecord } from "./index.js";
const r=(id:string,source:FeedbackRecord["source"]):FeedbackRecord=>({id,source,brand:"A",series:"X",summary:"车机黑屏",categories:["车机"],evidenceIds:[id]});
describe("market feedback",()=>{it("clusters repeated cross-source issues",()=>{const c=clusterFeedback([r("1","12365auto"),r("2","12365auto"),r("3","dongchedi")]);expect(c).toHaveLength(1);expect(c[0]?.signal).toBe("verify-before-buy");});it("pauses for unresolved official severe safety evidence",()=>{const c=clusterFeedback([{...r("1","official"),summary:"电池热失控",severity:"high",officialConfirmed:true}]);expect(c[0]?.signal).toBe("pause");});it("detects recurrence after a resolution",()=>{const records=[{...r("1","12365auto"),manufacturerResponse:"已修复"},{...r("2","12365auto"),summary:"车机黑屏再次出现"},{...r("3","dongchedi"),summary:"车机黑屏"}];expect(feedbackSignal(records)).toBe("verify-before-buy");});it("normalizes 12365auto rows",()=>{const rows=normalize12365Complaints([{id:"9",brand:"A",series:"X",modelYear:"2025",problem:"车机黑屏",categories:["车机"],url:"https://12365auto.com/9"}]);expect(rows[0]).toMatchObject({id:"12365auto:9",source:"12365auto",modelYear:"2025"});});});

describe("feedback snapshots", () => {
  it("diffs added and removed complaint records deterministically", async () => {
    const { diffFeedbackSnapshots } = await import("./index.js");
    const before = { id: "b", capturedAt: "2026-01-01", records: [{ id: "1", source: "12365auto" as const, brand: "A", series: "X", summary: "旧", categories: [], evidenceIds: ["e1"] }], sourceEvidenceIds: ["e1"] };
    const after = { id: "a", capturedAt: "2026-01-02", records: [{ id: "2", source: "12365auto" as const, brand: "A", series: "X", summary: "新", categories: [], evidenceIds: ["e2"] }], sourceEvidenceIds: ["e2"] };
    expect(diffFeedbackSnapshots(before, after).added.map(x => x.id)).toEqual(["2"]);
    expect(diffFeedbackSnapshots(before, after).removed.map(x => x.id)).toEqual(["1"]);
  });
});
