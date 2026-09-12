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
  const range = candidate.onRoadCost.status === "known" ? candidate.onRoadCost.range : undefined;
  if (!range) {
    return "unknown";
  }
  return `${money(range.minimumCny)}–${money(range.maximumCny)}`;
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
  const domains = root["operatingDomains"] as Record<string, unknown> | undefined;
  const capabilityLines = new Set<string>();
  const describe = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(describe); return; }
    if (!value || typeof value !== "object") return;
    const item = value as Record<string, unknown>;
    if (typeof item["availability"] === "string") {
      capabilityLines.add(`${cell(item["label"] ?? item["key"])}:${cell(item["availability"])}${item["configPrice"] ? ` (option price ${cell(item["configPrice"])})` : ""}`);
      describe(item["options"]);
    } else Object.values(item).forEach(describe);
  };
  describe(capabilities);
  describe(domains);
  const capabilityText = [...capabilityLines].join(", ");
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
    ...(report.dataAsOf ? [`- Data as of: ${report.dataAsOf}`] : []),
    ...(report.freshness ? [`- Freshness: ${report.freshness}`] : []),
    `- Coverage: ${report.coverage.mode}`,
    "",
    "## Candidates",
    "",
    "Source vehicle prices are references only; unknown mandatory costs are not zero. Candidate order applies only to the inspected evidence, not the whole market.",
    "",
    "| Candidate | Eligibility | Exact trim | Body style | Vehicle reference (excludes costs) | Verified on-road total | Missing costs | Cross-source | Evidence |",
    "|---|---|---|---|---|---|---|---|---:|",
  ];
  if (report.candidates.length === 0) {
    lines.push("| none | | | | | | | | 0 |");
  } else {
    for (const candidate of report.candidates) {
      lines.push(
        `| ${cell(`${candidate.series.brand} ${candidate.series.name}`)} | ${candidate.eligibility} | ${cell(`${candidate.trim.year} ${candidate.trim.name}`)} | ${cell(candidate.series.bodyStyle ?? "unknown")} | ${cell(candidate.trim.dealerPrice || candidate.trim.ownerPrice || candidate.trim.officialPrice) || "unknown"} | ${onRoad(candidate)} | ${cell(candidate.onRoadCost.missingComponents.join(", ")) || "none"} | ${candidate.crossSource.status} | ${candidate.evidenceIds.length} |`,
      );
    }
  }
  if (report.discoveredSeries?.length) {
    lines.push("", "## Discovery ledger", "", "| Series | Origins | State | Reason | Evidence |", "|---|---|---|---|---|");
    for (const item of report.discoveredSeries) lines.push(`| ${cell(`${item.brand} ${item.name}`)} | ${cell(item.origins.join(", "))} | ${item.status} | ${cell(item.reason)} | ${cell(item.evidenceIds.join(", "))} |`);
  }
  if (report.allCandidates?.length) {
    const displayed = new Set(report.candidates.map((item) => item.candidateId));
    lines.push("", "## All series representatives (before display limit)", "", "| Series | Exact trim | Eligibility | Configuration | Display |", "|---|---|---|---|---|");
    for (const item of report.allCandidates) lines.push(`| ${cell(item.series.name)} | ${cell(`${item.trim.year} ${item.trim.name}`)} | ${item.eligibility} | ${item.configurationStatus ?? "unknown"} | ${displayed.has(item.candidateId) ? "shown" : item.eligibility === "rejected" ? "hard condition failed" : "presentation limit"} |`);
  }
  lines.push("", "## Criterion matrix", "", "| Candidate | Criterion | Kind | Result | Explanation | Evidence |", "|---|---|---|---|---|---|");
  for (const candidate of report.evaluatedTrims ?? [...report.candidates, ...report.rejected]) {
    for (const criterion of candidate.criterionResults) {
      lines.push(
        `| ${cell(`${candidate.series.name} ${candidate.trim.year} ${candidate.trim.name}`)} | ${cell(criterion.criterion.label)} | ${criterion.criterion.kind} | ${criterion.status} | ${cell(criterion.message)} | ${cell(criterion.evidenceIds.join(", ")) || "none"} |`,
      );
    }
  }
  lines.push("", "## Driving-assistance matrix", "", "| Candidate | Claimed level | Capabilities | Hardware | System |", "|---|---|---|---|---|");
  for (const candidate of report.candidates) {
    const assistance = assistanceSummary(candidate);
    lines.push(
      `| ${cell(`${candidate.series.name} ${candidate.trim.year} ${candidate.trim.name}`)} | ${assistance.claimedLevel} | ${cell(assistance.capabilities)} | ${cell(assistance.hardware)} | ${cell(assistance.system)} |`,
    );
  }
  if (report.candidates.some((candidate) => candidate.alternatives?.length)) {
    lines.push("", "## Unselected exact trims", "", "| Series | Trim | Year | Price | Reason |", "|---|---|---|---|---|");
    for (const candidate of report.candidates) {
      for (const alternative of candidate.alternatives ?? []) {
        lines.push(`| ${cell(candidate.series.name)} | ${cell(alternative.name)} | ${cell(alternative.year)} | ${cell(alternative.price)} | ${cell(alternative.reason)} |`);
      }
    }
  }
  lines.push("", "## Coverage limitations", "");
  report.coverage.limitations.forEach((limitation) => lines.push(`- ${limitation}`));
  if (report.marketChanges?.length) {
    lines.push("", "## Recent market changes", "", "| Series | Change | Summary | Evidence |", "|---|---|---|---|");
    report.marketChanges.forEach((change) => lines.push(`| ${cell(change.seriesId)} | ${cell(change.kind)} | ${cell(change.summary)} | ${cell(change.evidenceIds.join(", "))} |`));
  }
  if (report.feedbackClusters?.length) {
    lines.push("", "## User feedback and complaints", "", "| Series | Topic | Signal | Years | Trims | Sources | Trend | Rationale | Evidence |", "|---|---|---|---|---|---|---|---|---|");
    report.feedbackClusters.forEach((cluster) => lines.push(`| ${cell(cluster.series)} | ${cell(cluster.topic)} | ${cell(cluster.signal)} | ${cell((cluster.modelYears ?? []).join(", "))} | ${cell((cluster.trimIds ?? []).join(", "))} | ${cell(String(cluster.sourceCount ?? ""))} | ${cell([cluster.firstSeenAt, cluster.lastSeenAt].filter(Boolean).join(" -> "))} | ${cell(cluster.rationale)} | ${cell(cluster.evidenceIds.join(", "))} |`));
  }
  if (report.recommendation) {
    lines.push("## Recommendation");
    lines.push(`- Status: ${cell(report.recommendation.status)}`);
    lines.push(`- Rationale: ${cell(report.recommendation.rationale)}`);
    lines.push(`- Evidence: ${cell(report.recommendation.evidenceIds.join(", "))}`);
  }
  if (report.actionItems?.length) {
    lines.push("", "## Before-buy actions", "");
    report.actionItems.forEach((item) => lines.push(`- ${cell(item)}`));
  }
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
