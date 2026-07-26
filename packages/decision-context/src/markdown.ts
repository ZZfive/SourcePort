import type { DecisionContextReport, DecisionEvidenceCorpus } from "./contracts.js";

function cell(value: unknown): string {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

export function renderDecisionCorpusMarkdown(corpus: DecisionEvidenceCorpus): string {
  const lines = [
    "# Decision Evidence Corpus",
    "",
    `- Status: ${corpus.status}`,
    `- Domain: ${corpus.brief.domain}`,
    `- Query: ${corpus.brief.query}`,
    `- Generated: ${corpus.generatedAt}`,
    `- Documents: ${corpus.coverage.documents}`,
    `- Queries: ${corpus.coverage.attemptedQueries}`,
    "",
    "## Documents",
    "",
    "| ID | Source | Role | Stage | Published | Subjects | Title / summary | Evidence |",
    "|---|---|---|---|---|---|---|---|",
  ];
  if (corpus.documents.length === 0) lines.push("| none | | | | | | | |");
  for (const document of corpus.documents) lines.push(
    `| ${cell(document.id)} | ${cell(document.source)} | ${document.sourceRole} | ${document.stage} | ${document.publishedAt ?? "date unknown"} | ${cell(document.subjectIds.join(", "))} | ${cell(`${document.title}: ${document.summary}`)} | ${cell(document.evidenceIds.join(", "))} |`,
  );
  lines.push("", "## Source coverage", "");
  for (const [source, count] of Object.entries(corpus.coverage.bySource).sort(([left], [right]) => left.localeCompare(right))) {
    lines.push(`- ${source}: ${count} documents`);
  }
  if (corpus.coverage.limitations.length > 0) {
    lines.push("", "## Limitations", "");
    corpus.coverage.limitations.forEach((limitation) => lines.push(`- ${limitation}`));
  }
  if (corpus.warnings.length > 0) {
    lines.push("", "## Warnings", "");
    corpus.warnings.forEach((warning) => lines.push(`- ${warning.code}: ${warning.message}`));
  }
  if (corpus.recoveryActions.length > 0) {
    lines.push("", "## Recovery actions", "");
    corpus.recoveryActions.forEach((action) => lines.push(`- ${action.kind}: ${action.description}`));
  }
  lines.push("", "## Evidence ledger", "");
  corpus.evidence.forEach((evidence) => lines.push(
    `- ${evidence.id}: ${evidence.source}.${evidence.operation} via ${evidence.backend}, ${evidence.retrievedAt}${evidence.sourceUrl ? `, ${evidence.sourceUrl}` : ""}`,
  ));
  return `${lines.join("\n")}\n`;
}
export function renderDecisionContextMarkdown(report: DecisionContextReport): string {
  const lines = [
    "# Decision Context Report",
    "",
    `- Status: ${report.status}`,
    `- Domain: ${report.domain}`,
    `- Query: ${report.query}`,
    `- Generated: ${report.generatedAt}`,
    "",
    "## Events and decision flags",
    "",
    "| Subject(s) | Event | Verification | Applicability | Severity | Remediation | Flag | Date | Evidence |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  if (report.events.length === 0) lines.push("| none | | | | | | context-only | | |");
  for (const event of report.events) lines.push(
    `| ${cell(event.subjectIds.join(", "))} | ${cell(event.title)} | ${event.verification} | ${event.applicability} | ${event.severity} | ${event.remediation} | ${event.decisionFlag} | ${event.occurredAt ?? "date unknown"} | ${cell([...event.documentIds, ...event.evidenceIds].join(", "))} |`,
  );
  lines.push("", "## Owner signals", "", "| Subject(s) | Topic | Polarity | Recurrence | Documents | Sources | Summary |", "|---|---|---|---|---:|---:|---|");
  if (report.ownerSignals.length === 0) lines.push("| none | | | | 0 | 0 | |");
  for (const signal of report.ownerSignals) lines.push(
    `| ${cell(signal.subjectIds.join(", "))} | ${cell(signal.topic)} | ${signal.polarity} | ${signal.recurrence} | ${signal.distinctDocuments} | ${signal.distinctSources} | ${cell(signal.summary)} |`,
  );
  if (report.conflicts.length > 0) {
    lines.push("", "## Conflicts", "");
    report.conflicts.forEach((conflict) => lines.push(`- ${conflict.title}: ${conflict.summary} (${conflict.independentSources} source families)`));
  }
  if (report.unknowns.length > 0) {
    lines.push("", "## Unknowns that could change the decision", "");
    report.unknowns.forEach((unknown) => lines.push(`- ${unknown.question}`));
  }
  if (report.coverage.limitations.length > 0) {
    lines.push("", "## Coverage limitations", "");
    report.coverage.limitations.forEach((limitation) => lines.push(`- ${limitation}`));
  }
  if (report.warnings.length > 0) {
    lines.push("", "## Source warnings", "");
    report.warnings.forEach((warning) => lines.push(`- ${warning.code}: ${warning.message}`));
  }
  lines.push("", "## Evidence ledger", "");
  report.documents.forEach((document) => lines.push(`- ${document.id}: ${document.source}.${document.sourceOperation}, ${document.url ?? "no URL"}`));
  report.evidence.forEach((evidence) => lines.push(`- ${evidence.id}: ${evidence.source}.${evidence.operation} via ${evidence.backend}`));
  return `${lines.join("\n")}\n`;
}
