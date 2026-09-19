import type { PropertyResearchReport } from "./contracts.js";

export function renderPropertyResearchMarkdown(report: PropertyResearchReport): string {
  const lines = [`# ${report.market.city}买房研究`, ``, `- 状态：${report.status}`, `- 查询：${report.query}`, `- 生成时间：${report.generatedAt}`, `- 候选覆盖：${report.coverage.displayedCandidates}/${report.coverage.evaluatedCandidates}`, ``];
  for (const candidate of report.candidates) {
    const price = candidate.allInCost.estimateRange ?? candidate.allInCost.range;
    lines.push(`## ${candidate.identity.community}（${candidate.kind === "new" ? "新房" : "二手房"}）`);
    lines.push(`- 资格：${candidate.eligibility}`);
    lines.push(`- 户型：${candidate.attributes.bedrooms ?? "未知"}室${candidate.attributes.livingRooms ?? "未知"}厅`);
    if (candidate.askingPrice) lines.push(`- 挂牌价：${candidate.askingPrice.minimumCny}–${candidate.askingPrice.maximumCny} 元（不是成交价）`);
    lines.push(`- ${candidate.allInCost.status === "known" ? "总包" : candidate.allInCost.status === "estimate" ? "总包估算" : "总包"}：${price ? `${price.minimumCny}–${price.maximumCny} 元` : "未知"}`);
    lines.push(`- 已核验费用证据下限：${candidate.allInCost.verifiedLowerBoundCny} 元；缺项：${candidate.allInCost.missingComponents.join("、") || "无"}`);
    lines.push(`- 月供情景：${candidate.financing.scenarios.length ? `${Math.min(...candidate.financing.scenarios.map((item) => item.monthlyPaymentCny))}–${Math.max(...candidate.financing.scenarios.map((item) => item.monthlyPaymentCny))} 元/月` : "未知"}`);
    lines.push(`- 通勤：${candidate.commute.map((item) => `${item.label}=${item.minutes === undefined ? "未知" : `${item.minutes} 分钟`}`).join("；") || "未知"}`);
    lines.push(`- 核验：${candidate.criterionResults.map((item) => `${item.criterion.label}=${item.status}`).join("；")}`, ``);
    if (candidate.actionItems.length) lines.push(`- 买前动作：${candidate.actionItems.join("；")}`);
  }
  if (report.rejected.length) {
    lines.push(`## 已排除候选`, ``, ...report.rejected.map(candidate => `- ${candidate.identity.community}（${candidate.kind === "new" ? "新房" : "二手房"}）：${candidate.criterionResults.filter(item => item.status === "fail").map(item => item.message).join("；")}`), ``);
  }
  if (report.coverage.limitations.length) lines.push(`## 覆盖限制`, ``, ...report.coverage.limitations.map((item) => `- ${item}`), ``);
  return `${lines.join("\n")}\n`;
}
