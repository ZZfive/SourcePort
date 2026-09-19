import type { CarCandidate, CarResearchReport } from "./contracts.js";

function cell(value: unknown): string {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

function status(value: string): string {
  return ({ success: "可用", partial: "部分覆盖", blocked: "受阻", failed: "失败", eligible: "符合已知条件", "needs-verification": "待核验", rejected: "已排除", pass: "通过", fail: "未通过", unknown: "未知", conflict: "冲突", unsupported: "不支持", matched: "已匹配", unmatched: "未匹配" } as Record<string, string>)[value] ?? value;
}

function money(value: number | undefined): string {
  return value === undefined ? "未核验" : `¥${Math.round(value).toLocaleString("zh-CN")}`;
}

function onRoad(candidate: CarCandidate): string {
  const range = candidate.onRoadCost.status === "known" ? candidate.onRoadCost.range : undefined;
  return range ? `${money(range.minimumCny)}–${money(range.maximumCny)}` : "未核验";
}

function candidateName(candidate: CarCandidate): string {
  return `${candidate.series.brand} ${candidate.series.name}`.trim();
}

function trimName(candidate: CarCandidate): string {
  return `${candidate.trim.year} ${candidate.trim.name}`.trim();
}

function budgetCheck(candidate: CarCandidate): string {
  const result = candidate.criterionResults.find((item) => item.criterion.key === "budget.onRoad.maxCny");
  return result ? status(result.status) : "未核验";
}

function assistanceCheck(candidate: CarCandidate): string {
  const result = candidate.criterionResults.find((item) => item.criterion.key === "drivingAssistance.capabilities");
  if (!result) return "未核验";
  if (!result.details?.length) return status(result.status);
  if (result.status === "pass") return `${result.details.length}/${result.details.length}项通过`;
  const failed = result.details.filter((item) => item.status === "fail").map((item) => item.key);
  const unknown = result.details.filter((item) => item.status === "unknown").map((item) => item.key);
  return [failed.length ? `未通过：${failed.join("、")}` : "", unknown.length ? `未知：${unknown.join("、")}` : ""].filter(Boolean).join("；") || status(result.status);
}

function limitationSummary(report: CarResearchReport): string[] {
  const translate = (value: string): string => {
    if (value.startsWith("research queried at most")) return "初始种子查询数量受上限约束，未查询的种子仍保留在记录中";
    if (value.startsWith("discovery uses explicit seeds")) return "发现范围来自明确种子、品牌目录和有限竞品链接，不代表完整市场普查";
    if (/^\d+ series retained;/.test(value)) return value.replace(/^(\d+) series retained; at most (\d+) admitted and (\d+) scanned$/, "共保留 $1 个车系，最多纳入 $2 个、扫描 $3 个");
    if (value.startsWith("finalCandidates=")) return "展示候选数量有上限，未展示候选仍保留在 JSON 报告中";
    if (value.startsWith("ordering uses")) return "排序依据是硬条件、偏好、证据完整度和来源质量，不代表驾驶质量评分";
    if (value.startsWith("source reference prices")) return "源站参考价不含未经核验的必要费用，不能直接视为落地价";
    if (value.startsWith("presale, announcement")) return "预售、公告和在售状态不能证明能在目标日期交付";
    return value;
  };
  const limitations = report.coverage.limitations.slice(0, 3).map(translate);
  if (report.coverage.limitations.length > limitations.length) limitations.push(`另有 ${report.coverage.limitations.length - limitations.length} 项限制，详见 JSON 报告`);
  return limitations;
}

/** Concise Chinese report for purchase decisions; full provenance remains in JSON. */
export function renderCarResearchMarkdown(report: CarResearchReport): string {
  const scanned = report.discoveredSeries?.filter((item) => item.status === "scanned").length ?? 0;
  const unresolved = report.discoveredSeries?.filter((item) => item.status !== "scanned").length ?? 0;
  const lines: string[] = [
    "# 买车研究报告", "",
    `- 研究状态：${status(report.status)}`,
    `- 市场：${cell(report.market.city)}`,
    `- 预算口径：${report.decisionContext?.budget?.basis === "on-road" ? "落地总价" : "参考价"}`,
    `- 生成时间：${report.generatedAt}`, "",
    "## 先看结论", "",
    report.candidates.length ? `当前有 ${report.candidates.length} 个候选进入人工核验阶段，不能仅凭本报告直接下单。` : "当前没有通过初筛的候选，需要补充数据后重试。",
    "源站车型价只是参考价，不代表武汉真实成交价；保险、上牌和其他必要费用未核验时，不按 0 元计算。", "",
    "## 候选车型", "",
    "| 车型 | 建议核验配置 | 参考价 | 落地预算 | 辅助驾驶核验 | 跨源匹配 |", "|---|---|---:|---|---|---|",
  ];
  if (!report.candidates.length) lines.push("| 暂无 | | | | | |");
  for (const candidate of report.candidates) {
    const price = candidate.trim.dealerPrice || candidate.trim.officialPrice || candidate.series.dealerPrice || candidate.series.officialPrice || "未核验";
    lines.push(`| ${cell(candidateName(candidate))} | ${cell(trimName(candidate))} | ${cell(price)} | ${budgetCheck(candidate)}（${onRoad(candidate)}） | ${cell(assistanceCheck(candidate))} | ${status(candidate.crossSource.status)} |`);
  }
  lines.push("", "## 需要先核验", "",
    `- 真实成交价：当前 ${report.candidates.length} 个候选的落地总价均未形成可验证区间。`,
    "- 配置价格：确认辅助驾驶是否为该年款、该配置标配，是否需要选装或订阅。",
    "- 线下信息：向武汉门店索取书面报价单，拆分裸车、保险、上牌、金融服务费和赠品折现。",
    `- 覆盖范围：已扫描 ${scanned} 个车系，另有 ${unresolved} 个车系未完成或未纳入本轮配置核验。`, "",
    "## 下一步", "",
    "- 先对候选车型做武汉本地真实报价核验，再比较最终落地价和试驾体验。",
    "- 对辅助驾驶重点确认高速领航、自动泊车的实际开通条件和适用范围。",
  );
  if (limitationSummary(report).length) {
    lines.push("", "## 覆盖限制", "");
    limitationSummary(report).forEach((item) => lines.push(`- ${cell(item)}`));
  }
  if (report.warnings.length) lines.push("", "## 数据提醒", "", `- 本轮有 ${report.warnings.length} 条数据提醒；机器可读详情和证据链保留在 JSON 报告中。`);
  lines.push("", "## 证据", "", `- 已保留 ${report.evidence.length} 条证据记录；完整来源、URL、时间和证据片段请查看 JSON 报告。`);
  return `${lines.join("\n")}\n`;
}
