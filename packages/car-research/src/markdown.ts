import type { CarCandidate, CarResearchReport } from "./contracts.js";

function cell(value: unknown): string {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replace(/\s+/g, " ")
    .trim();
}

function money(value: number | undefined): string {
  return value === undefined ? "unknown" : `¥${Math.round(value).toLocaleString("zh-CN")}`;
}

function onRoad(candidate: CarCandidate): string {
  const range = candidate.onRoadCost.range ?? candidate.onRoadCost.estimateRange;
  if (!range) {
    return "unknown";
  }
  const prefix = candidate.onRoadCost.status === "known" ? "" : "estimate ";
  return `${prefix}${money(range.minimumCny)}–${money(range.maximumCny)}`;
}

function assistanceSummary(candidate: CarCandidate): {
  claimedLevel: string;
  capabilities: string;
  hardware: string;
  system: string;
} {
  const root = candidate.drivingAssistance !== null && typeof candidate.drivingAssistance === "object"
    ? candidate.drivingAssistance as Record<string, unknown>
    : {};
  const claimed = root["claimedAutomationLevel"] as Record<string, unknown> | null | undefined;
  const capabilities = root["capabilities"] as Record<string, unknown> | undefined;
  const capabilityText = capabilities
    ? Object.values(capabilities).flatMap((group) => Array.isArray(group) ? group : [])
      .map((item) => item as Record<string, unknown>)
      .filter((item) => item["availability"] !== "unavailable")
      .map((item) => `${cell(item["label"] ?? item["key"])}:${cell(item["availability"])}`)
      .join(", ")
    : "";
  const hardware = root["hardware"] as Record<string, unknown> | undefined;
  const hardwareText = hardware
    ? Object.entries(hardware)
      .filter(([, value]) => value !== null && value !== "")
      .map(([key, value]) => `${key}=${cell(value)}`)
      .join(", ")
    : "";
  const system = root["system"] as Record<string, unknown> | undefined;
  return {
    claimedLevel: cell(claimed?.["value"]) || "unknown",
    capabilities: capabilityText || "unknown",
    hardware: hardwareText || "unknown",
    system: system
      ? [system["vendor"], system["name"], system["version"]].filter(Boolean).map(cell).join(" ") || "unknown"
      : "unknown",
  };
}

export function renderCarResearchMarkdown(report: CarResearchReport): string {
  const lines: string[] = [
    "# Car Research Report",
    "",
    `- Status: ${report.status}`,
    `- Query: ${report.query}`,
    `- Market: ${report.market.city}`,
    `- Generated: ${report.generatedAt}`,
    `- Coverage: ${report.coverage.mode}`,
    "",
    "## Candidates",
    "",
    "| Candidate | Eligibility | Exact trim | Body style | On-road cost | Cross-source | Evidence |",
    "|---|---|---|---|---|---|---:|",
  ];
  if (report.candidates.length === 0) {
    lines.push("| none | | | | | | 0 |");
  } else {
    for (const candidate of report.candidates) {
      lines.push(
        `| ${cell(`${candidate.series.brand} ${candidate.series.name}`)} | ${candidate.eligibility} | ${cell(`${candidate.trim.year} ${candidate.trim.name}`)} | ${cell(candidate.series.bodyStyle ?? "unknown")} | ${onRoad(candidate)} | ${candidate.crossSource.status} | ${candidate.evidenceIds.length} |`,
      );
    }
  }
  lines.push("", "## Criterion matrix", "", "| Candidate | Criterion | Kind | Result | Explanation | Evidence |", "|---|---|---|---|---|---|");
  for (const candidate of [...report.candidates, ...report.rejected]) {
    for (const criterion of candidate.criterionResults) {
      lines.push(
        `| ${cell(candidate.series.name)} | ${cell(criterion.criterion.label)} | ${criterion.criterion.kind} | ${criterion.status} | ${cell(criterion.message)} | ${cell(criterion.evidenceIds.join(", ")) || "none"} |`,
      );
    }
  }
  lines.push("", "## Driving-assistance matrix", "", "| Candidate | Claimed level | Capabilities | Hardware | System |", "|---|---|---|---|---|");
  for (const candidate of report.candidates) {
    const assistance = assistanceSummary(candidate);
    lines.push(
      `| ${cell(candidate.series.name)} | ${assistance.claimedLevel} | ${cell(assistance.capabilities)} | ${cell(assistance.hardware)} | ${cell(assistance.system)} |`,
    );
  }
  lines.push("", "## Coverage limitations", "");
  report.coverage.limitations.forEach((limitation) => lines.push(`- ${limitation}`));
  if (report.unsupportedCriteria.length > 0) {
    lines.push("", "## Unsupported criteria", "");
    report.unsupportedCriteria.forEach((criterion) =>
      lines.push(`- ${criterion.key}: ${criterion.label}`));
  }
  if (report.warnings.length > 0) {
    lines.push("", "## Warnings", "");
    report.warnings.forEach((warning) => lines.push(`- ${warning.code}: ${warning.message}`));
  }
  if (report.recoveryActions.length > 0) {
    lines.push("", "## Recovery actions", "");
    report.recoveryActions.forEach((action) =>
      lines.push(`- ${action.kind}: ${action.description}`));
  }
  lines.push("", "## Evidence", "");
  for (const evidence of report.evidence) {
    lines.push(
      `- ${evidence.id}: ${evidence.source}.${evidence.operation} via ${evidence.backend}, ${evidence.retrievedAt}${evidence.sourceUrl ? `, ${evidence.sourceUrl}` : ""}`,
    );
  }
  return `${lines.join("\n")}\n`;
}
