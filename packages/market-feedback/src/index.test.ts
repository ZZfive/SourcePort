import { describe, expect, it } from "vitest";
import { clusterFeedback, type FeedbackRecord } from "./index.js";
const r=(id:string,source:FeedbackRecord["source"]):FeedbackRecord=>({id,source,brand:"A",series:"X",summary:"车机黑屏",categories:["车机"],evidenceIds:[id]});
describe("market feedback",()=>it("clusters repeated cross-source issues",()=>{const c=clusterFeedback([r("1","12365auto"),r("2","12365auto"),r("3","dongchedi")]);expect(c).toHaveLength(1);expect(c[0]?.signal).toBe("verify-before-buy");}));
