import type { DoctorReport } from "@sourceport/core";

export function doctorExitCode(report: DoctorReport): number {
  const hasBlocked = report.sources.some((source) =>
    source.state === "blocked" ||
    source.operations.some((operation) => operation.state === "blocked"),
  );
  if (hasBlocked) {
    return 3;
  }
  return report.state === "healthy" ? 0 : 1;
}

export function formatDoctorHuman(report: DoctorReport): string {
  const lines = [
    `SourcePort doctor — ${report.checkedAt}`,
    `overall: ${report.state} (available=${String(report.available)}, durationMs=${String(report.durationMs)})`,
  ];
  for (const source of report.sources) {
    lines.push("");
    lines.push(
      `${source.source} (${source.displayName}): ${source.state}` +
      ` (available=${String(source.available)}, durationMs=${String(source.durationMs)})`,
    );
    if (source.message) {
      lines.push(`  ${source.message}`);
    }
    for (const operation of source.operations) {
      lines.push(
        `  ${operation.operation}: ${operation.state}` +
        ` (available=${String(operation.available)}, durationMs=${String(operation.durationMs)})`,
      );
      for (const backend of operation.backends) {
        const issue = backend.issueCode ? ` issue=${backend.issueCode}` : "";
        lines.push(
          `    ${backend.backend} [${backend.kind}/${backend.role}]: ${backend.state}` +
          ` available=${String(backend.available)} probe=${backend.probe}` +
          ` durationMs=${String(backend.durationMs)} circuit=${backend.circuit.state}` +
          ` failures=${String(backend.circuit.failureCount)}${issue}`,
        );
        if (backend.message) {
          lines.push(`      ${backend.message.replaceAll("\n", " ")}`);
        }
      }
    }
    for (const action of source.recoveryActions) {
      lines.push(`  recovery: ${action.kind} — ${action.description}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
