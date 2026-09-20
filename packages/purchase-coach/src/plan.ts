import type { BuyerProfile, PurchasePlanReport, PurchasePlanStage } from "./contracts.js";
import { assessHouseholdLiquidity } from "./liquidity.js";

interface PropertyReportLike {
  status?: string;
  candidates?: Array<{
    candidateId: string;
    identity?: { community?: string };
    eligibility?: string;
    identityStatus?: string;
    actionItems?: string[];
    verificationTasks?: unknown[];
    gates?: Array<{ phase: string; status: string; reasons: string[] }>;
  }>;
}
interface CarReportLike { status?: string; candidates?: unknown[]; }

function stage(profile: BuyerProfile, property: PropertyReportLike | undefined, liquidity: ReturnType<typeof assessHouseholdLiquidity>): PurchasePlanStage {
  if (liquidity.paused) return "bound";
  if (!property?.candidates?.length) return "explore";
  if (property.candidates.some(candidate => candidate.gates?.some(gate => gate.phase === "contract" && gate.status === "passed"))) return "review";
  if (property.candidates.some(candidate => candidate.gates?.some(gate => gate.phase === "negotiation" && gate.status === "passed"))) return "contract";
  if (property.candidates.some(candidate => candidate.gates?.some(gate => gate.phase === "finance" && gate.status === "passed"))) return "negotiate";
  return profile.coachingMode === "education-and-research" ? "compare" : "verify";
}

export function createPurchasePlan(profile: BuyerProfile, property?: PropertyReportLike, car?: CarReportLike): PurchasePlanReport {
  const liquidity = assessHouseholdLiquidity(profile.finance, profile.scenario ?? {
    ...(profile.timing?.carAfterMonths === undefined ? {} : { carPurchaseAfterMonths: profile.timing.carAfterMonths }),
    ...(profile.timing?.propertyAfterMonths === undefined ? {} : { propertyPurchaseAfterMonths: profile.timing.propertyAfterMonths }),
  });
  const candidates = (property?.candidates ?? []).map(candidate => ({
    candidateId: candidate.candidateId,
    community: candidate.identity?.community ?? "unknown",
    eligibility: candidate.eligibility ?? "unknown",
    ...(candidate.identityStatus ? { identityStatus: candidate.identityStatus } : {}),
    actionItems: candidate.actionItems ?? [],
    verificationTasks: candidate.verificationTasks ?? [],
  }));
  const unknowns = [
    ...(liquidity.status === "unknown" ? ["现金储备底线尚未配置"] : []),
    ...(liquidity.paymentStatus === "unknown" ? ["车房合计月供上限尚未配置"] : []),
    ...(candidates.some(candidate => candidate.eligibility !== "eligible") ? ["部分房产候选仍有未知或冲突证据"] : []),
  ];
  const pausedCandidateIds = candidates.filter(candidate => candidate.eligibility !== "eligible").map(candidate => candidate.candidateId);
  return {
    generatedAt: new Date().toISOString(),
    stage: stage(profile, property, liquidity),
    knownFacts: [
      `家庭月度可支配结余：${liquidity.monthlyFreeCashFlowCny} 元`,
      `车房计划现金支出：${liquidity.plannedCashOutlayCny} 元`,
      `最低现金储备：${liquidity.minimumReserveCny} 元`,
    ],
    unknowns,
    liquidity,
    property: { status: property?.status === "success" || property?.status === "partial" || property?.status === "failed" ? property.status : "missing", candidates, pausedCandidateIds },
    ...(car ? { car: { status: car.status === "success" || car.status === "partial" || car.status === "blocked" || car.status === "failed" ? car.status : "missing", candidateCount: car.candidates?.length ?? 0 } } : {}),
    nextActions: [
      ...(liquidity.paused ? ["暂停新增购房承诺，先补齐现金储备和月供边界"] : []),
      ...(pausedCandidateIds.length ? ["按候选核验任务补齐身份、产权/预售、贷款和总包证据"] : []),
      ...(property?.candidates?.length ? ["对通过基础门槛的候选安排看房并记录现场观察"] : ["执行 property-discover，生成有来源的房源候选"]),
    ],
  };
}

export function renderPurchasePlanMarkdown(report: PurchasePlanReport): string {
  return [
    "# 买房完整闭环计划",
    "",
    `- 当前阶段：${report.stage}`,
    `- 生成时间：${report.generatedAt}`,
    `- 流动性状态：${report.liquidity.status}`,
    `- 是否暂停：${report.liquidity.paused ? "是" : "否"}`,
    "",
    "## 已知事实",
    "",
    ...report.knownFacts.map(item => `- ${item}`),
    "",
    "## 未知项",
    "",
    ...(report.unknowns.length ? report.unknowns.map(item => `- ${item}`) : ["- 暂无"]),
    "",
    "## 房产候选",
    "",
    ...(report.property.candidates.length ? report.property.candidates.map(item => `- ${item.community}（${item.candidateId}）：${item.eligibility}${item.identityStatus ? `，身份=${item.identityStatus}` : ""}`) : ["- 暂无候选"]),
    "",
    "## 下一步动作",
    "",
    ...report.nextActions.map(item => `- ${item}`),
    "",
  ].join("\n");
}
