import { describe, expect, it } from "vitest";
import { __test__ } from "./index.js";
describe("12365auto parser",()=>it("normalizes complaint rows",()=>{const r=__test__.complaintData([{id:"1",brand:"A",series:"X",model:"2025款",problem:"车机 黑屏",date:"2026-09-01",status:"处理中",url:"https://www.12365auto.com/zlts/1"}],"X");expect(r.items[0]?.complaintId).toBe("1");expect(r.items[0]?.summary).toBe("车机 黑屏");}));
