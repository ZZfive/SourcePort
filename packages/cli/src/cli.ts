import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { AutohomeAdapter } from "@sourceport/autohome";
import { BraveSearchAdapter } from "@sourceport/brave-search";
import {
  buildCarDecisionContextBrief,
  createRegistrySourceExecutor,
  renderCarResearchMarkdown,
  researchCars,
  validateCarResearchBrief,
  type CarResearchReport,
  type SourceExecutor,
} from "@sourceport/car-research";
import {
  collectDecisionContext,
  compileDecisionContext,
  renderDecisionContextMarkdown,
  renderDecisionCorpusMarkdown,
  validateDecisionContextBrief,
  validateDecisionContextAssessment,
  validateDecisionEvidenceCorpus,
  type DecisionEvidenceCorpus,
  type DecisionContextReport,
} from "@sourceport/decision-context";
import {
  executeWithFreshness,
  FileCache,
  runDoctor,
  SourceRegistry,
  SourceRegistryError,
  type ResultCache,
  type SourceResult,
} from "@sourceport/core";
import { DongchediAdapter } from "@sourceport/dongchedi";
import { Kr36Adapter } from "@sourceport/kr36";
import { SamrAdapter } from "@sourceport/samr";
import { XiaohongshuAdapter } from "@sourceport/xiaohongshu";

import { doctorExitCode, formatDoctorHuman } from "./commands/doctor.js";

export interface CliDependencies {
  registry?: SourceRegistry;
  stdout?: (value: string) => void;
  stderr?: (value: string) => void;
  now?: () => Date;
  cache?: ResultCache;
  researchExecutor?: SourceExecutor;
}

function writeJson(write: (value: string) => void, value: unknown): void {
  write(`${JSON.stringify(value, null, 2)}\n`);
}

function failureExitCode(result: SourceResult): number {
  if (result.status === "blocked") {
    return 3;
  }
  return result.status === "failed" ? 1 : 0;
}

function cliError(code: string, message: string) {
  return { error: { code, message } };
}

function researchExitCode(report: CarResearchReport): number {
  if (report.status === "blocked") {
    return 3;
  }
  return report.status === "success" ? 0 : 1;
}

function contextExitCode(result: DecisionEvidenceCorpus | DecisionContextReport): number {
  if ("brief" in result && result.status === "blocked") return 3;
  return result.status === "success" ? 0 : 1;
}

async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function saveJsonFile(path: string | undefined, value: unknown): Promise<void> {
  if (path) await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function createDefaultRegistry(): SourceRegistry {
  const registry = new SourceRegistry();
  registry.register(new AutohomeAdapter());
  const localOpenCli = fileURLToPath(
    new URL("../../../node_modules/.bin/opencli", import.meta.url),
  );
  registry.register(
    new DongchediAdapter({
      openCliCommand: process.env["SOURCEPORT_OPENCLI_COMMAND"] ??
        (existsSync(localOpenCli) ? localOpenCli : "opencli"),
    }),
  );
  const openCliCommand = process.env["SOURCEPORT_OPENCLI_COMMAND"] ??
    (existsSync(localOpenCli) ? localOpenCli : "opencli");
  registry.register(new BraveSearchAdapter({ openCliCommand }));
  registry.register(new Kr36Adapter(openCliCommand));
  registry.register(new SamrAdapter({ openCliCommand }));
  registry.register(new XiaohongshuAdapter(openCliCommand));
  return registry;
}

export async function runCli(
  argv: readonly string[],
  dependencies: CliDependencies = {},
): Promise<number> {
  const registry = dependencies.registry ?? createDefaultRegistry();
  const stdout = dependencies.stdout ?? ((value: string) => process.stdout.write(value));
  const stderr = dependencies.stderr ?? ((value: string) => process.stderr.write(value));
  const now = dependencies.now ?? (() => new Date());
  const command = argv[0];

  try {
    if (command === "sources") {
      writeJson(stdout, { sources: registry.listSources() });
      return 0;
    }

    if (command === "capabilities") {
      const source = argv[1];
      if (!source) {
        writeJson(stderr, cliError("invalid_cli_input", "capabilities requires a source"));
        return 2;
      }
      writeJson(stdout, { source, operations: registry.listCapabilities(source) });
      return 0;
    }

    if (command === "doctor") {
      const sourceArgument = argv[1];
      const source = sourceArgument && !sourceArgument.startsWith("-") ? sourceArgument : undefined;
      const parsed = parseArgs({
        args: [...argv.slice(source ? 2 : 1)],
        allowPositionals: false,
        strict: true,
        options: {
          json: { type: "boolean", default: false },
          "timeout-ms": { type: "string" },
        },
      });
      const timeoutMs = parsed.values["timeout-ms"] === undefined
        ? undefined
        : Number(parsed.values["timeout-ms"]);
      if (timeoutMs !== undefined && (!Number.isInteger(timeoutMs) || timeoutMs < 1)) {
        writeJson(stderr, cliError("invalid_cli_input", "--timeout-ms must be a positive integer"));
        return 2;
      }
      const report = await runDoctor(registry, {
        ...(source ? { source } : {}),
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
        now,
      });
      if (parsed.values.json) {
        writeJson(stdout, report);
      } else {
        stdout(formatDoctorHuman(report));
      }
      return doctorExitCode(report);
    }

    if (command === "research-cars") {
      const parsed = parseArgs({
        args: [...argv.slice(1)],
        allowPositionals: false,
        strict: true,
        options: {
          input: { type: "string" },
          "input-file": { type: "string" },
          format: { type: "string", default: "json" },
          "report-file": { type: "string" },
        },
      });
      const inlineInput = parsed.values.input;
      const inputFile = parsed.values["input-file"];
      if ((inlineInput === undefined) === (inputFile === undefined)) {
        writeJson(
          stderr,
          cliError("invalid_cli_input", "research-cars requires exactly one of --input or --input-file"),
        );
        return 2;
      }
      const format = parsed.values.format;
      if (format !== "json" && format !== "md") {
        writeJson(stderr, cliError("invalid_cli_input", "--format must be json or md"));
        return 2;
      }
      let serialized: string;
      try {
        serialized = inlineInput ?? await readFile(inputFile!, "utf8");
      } catch (error) {
        writeJson(
          stderr,
          cliError(
            "invalid_cli_input",
            `cannot read --input-file: ${error instanceof Error ? error.message : "unknown error"}`,
          ),
        );
        return 2;
      }
      let brief: unknown;
      try {
        brief = JSON.parse(serialized) as unknown;
      } catch {
        writeJson(stderr, cliError("invalid_cli_input", "research input must be valid JSON"));
        return 2;
      }
      const briefValidation = validateCarResearchBrief(brief);
      if (!briefValidation.ok) {
        writeJson(stderr, {
          ...cliError("invalid_cli_input", "invalid CarResearchBrief"),
          issues: briefValidation.issues,
        });
        return 2;
      }
      const executor = dependencies.researchExecutor ?? createRegistrySourceExecutor({
        registry,
        cache: dependencies.cache ?? new FileCache(),
        now,
      });
      const report = await researchCars(brief, { execute: executor, now });
      await saveJsonFile(parsed.values["report-file"], report);
      if (format === "md") {
        stdout(renderCarResearchMarkdown(report));
      } else {
        writeJson(stdout, report);
      }
      return researchExitCode(report);
    }

    if (command === "car-context" && argv[1] === "collect") {
      const parsed = parseArgs({
        args: [...argv.slice(2)],
        allowPositionals: false,
        strict: true,
        options: {
          "report-file": { type: "string" },
          format: { type: "string", default: "json" },
          "corpus-file": { type: "string" },
        },
      });
      const reportFile = parsed.values["report-file"];
      if (!reportFile) {
        writeJson(stderr, cliError("invalid_cli_input", "car-context collect requires --report-file"));
        return 2;
      }
      if (parsed.values.format !== "json" && parsed.values.format !== "md") {
        writeJson(stderr, cliError("invalid_cli_input", "--format must be json or md"));
        return 2;
      }
      let report: CarResearchReport;
      let brief: unknown;
      try {
        report = await readJsonFile(reportFile) as CarResearchReport;
        brief = buildCarDecisionContextBrief(report);
      } catch (error) {
        writeJson(stderr, cliError("invalid_cli_input", `invalid car report: ${error instanceof Error ? error.message : "unknown error"}`));
        return 2;
      }
      const executor = dependencies.researchExecutor ?? createRegistrySourceExecutor({
        registry,
        cache: dependencies.cache ?? new FileCache(),
        now,
      });
      const corpus = await collectDecisionContext(brief, { execute: executor, now });
      await saveJsonFile(parsed.values["corpus-file"], corpus);
      if (parsed.values.format === "md") stdout(renderDecisionCorpusMarkdown(corpus));
      else writeJson(stdout, corpus);
      return contextExitCode(corpus);
    }

    if (command === "context" && argv[1] === "collect") {
      const parsed = parseArgs({
        args: [...argv.slice(2)],
        allowPositionals: false,
        strict: true,
        options: {
          "input-file": { type: "string" },
          format: { type: "string", default: "json" },
          "corpus-file": { type: "string" },
        },
      });
      const inputFile = parsed.values["input-file"];
      if (!inputFile) {
        writeJson(stderr, cliError("invalid_cli_input", "context collect requires --input-file"));
        return 2;
      }
      if (parsed.values.format !== "json" && parsed.values.format !== "md") {
        writeJson(stderr, cliError("invalid_cli_input", "--format must be json or md"));
        return 2;
      }
      let brief: unknown;
      try {
        brief = await readJsonFile(inputFile);
      } catch (error) {
        writeJson(stderr, cliError("invalid_cli_input", `cannot read context brief: ${error instanceof Error ? error.message : "unknown error"}`));
        return 2;
      }
      const validation = validateDecisionContextBrief(brief);
      if (!validation.ok) {
        writeJson(stderr, { ...cliError("invalid_cli_input", "invalid DecisionContextBrief"), issues: validation.issues });
        return 2;
      }
      const executor = dependencies.researchExecutor ?? createRegistrySourceExecutor({
        registry,
        cache: dependencies.cache ?? new FileCache(),
        now,
      });
      const corpus = await collectDecisionContext(brief, { execute: executor, now });
      await saveJsonFile(parsed.values["corpus-file"], corpus);
      if (parsed.values.format === "md") stdout(renderDecisionCorpusMarkdown(corpus));
      else writeJson(stdout, corpus);
      return contextExitCode(corpus);
    }

    if (command === "context" && argv[1] === "compile") {
      const parsed = parseArgs({
        args: [...argv.slice(2)],
        allowPositionals: false,
        strict: true,
        options: {
          "corpus-file": { type: "string" },
          "assessment-file": { type: "string" },
          format: { type: "string", default: "json" },
          "report-file": { type: "string" },
        },
      });
      const corpusFile = parsed.values["corpus-file"];
      const assessmentFile = parsed.values["assessment-file"];
      if (!corpusFile || !assessmentFile) {
        writeJson(stderr, cliError("invalid_cli_input", "context compile requires --corpus-file and --assessment-file"));
        return 2;
      }
      if (parsed.values.format !== "json" && parsed.values.format !== "md") {
        writeJson(stderr, cliError("invalid_cli_input", "--format must be json or md"));
        return 2;
      }
      let corpus: unknown;
      let assessment: unknown;
      try {
        [corpus, assessment] = await Promise.all([readJsonFile(corpusFile), readJsonFile(assessmentFile)]);
      } catch (error) {
        writeJson(stderr, cliError("invalid_cli_input", `cannot read context input: ${error instanceof Error ? error.message : "unknown error"}`));
        return 2;
      }
      const corpusValidation = validateDecisionEvidenceCorpus(corpus);
      const assessmentValidation = validateDecisionContextAssessment(assessment);
      if (!corpusValidation.ok || !assessmentValidation.ok) {
        writeJson(stderr, {
          ...cliError("invalid_cli_input", "invalid context corpus or assessment"),
          issues: [...corpusValidation.issues, ...assessmentValidation.issues],
        });
        return 2;
      }
      const compiled = compileDecisionContext(corpus, assessment, now);
      if (!compiled.ok || !compiled.report) {
        writeJson(stderr, { ...cliError("invalid_evidence_reference", "context assessment failed deterministic validation"), issues: compiled.issues });
        return 2;
      }
      await saveJsonFile(parsed.values["report-file"], compiled.report);
      if (parsed.values.format === "md") stdout(renderDecisionContextMarkdown(compiled.report));
      else writeJson(stdout, compiled.report);
      return contextExitCode(compiled.report);
    }

    if (command === "run") {
      const source = argv[1];
      const operation = argv[2];
      if (!source || !operation) {
        writeJson(stderr, cliError("invalid_cli_input", "run requires source and operation"));
        return 2;
      }
      const parsed = parseArgs({
        args: [...argv.slice(3)],
        allowPositionals: false,
        strict: true,
        options: {
          input: { type: "string" },
          "timeout-ms": { type: "string" },
          "retry-budget": { type: "string" },
          freshness: { type: "string" },
          "max-age-ms": { type: "string" },
        },
      });
      const input = parsed.values.input;
      if (input === undefined) {
        writeJson(stderr, cliError("invalid_cli_input", "run requires --input JSON"));
        return 2;
      }
      let parameters: unknown;
      try {
        parameters = JSON.parse(input) as unknown;
      } catch {
        writeJson(stderr, cliError("invalid_cli_input", "--input must be valid JSON"));
        return 2;
      }
      const timeoutMs = parsed.values["timeout-ms"] === undefined
        ? undefined
        : Number(parsed.values["timeout-ms"]);
      const retryBudget = parsed.values["retry-budget"] === undefined
        ? undefined
        : Number(parsed.values["retry-budget"]);
      if (timeoutMs !== undefined && (!Number.isInteger(timeoutMs) || timeoutMs < 1)) {
        writeJson(stderr, cliError("invalid_cli_input", "--timeout-ms must be a positive integer"));
        return 2;
      }
      if (retryBudget !== undefined && (!Number.isInteger(retryBudget) || retryBudget < 0)) {
        writeJson(stderr, cliError("invalid_cli_input", "--retry-budget must be a non-negative integer"));
        return 2;
      }
      const freshnessMode = parsed.values.freshness;
      if (
        freshnessMode !== undefined &&
        freshnessMode !== "live" &&
        freshnessMode !== "prefer-live" &&
        freshnessMode !== "allow-stale"
      ) {
        writeJson(
          stderr,
          cliError("invalid_cli_input", "--freshness must be live, prefer-live, or allow-stale"),
        );
        return 2;
      }
      const maxAgeMs = parsed.values["max-age-ms"] === undefined
        ? undefined
        : Number(parsed.values["max-age-ms"]);
      if (maxAgeMs !== undefined && (!Number.isInteger(maxAgeMs) || maxAgeMs < 1)) {
        writeJson(stderr, cliError("invalid_cli_input", "--max-age-ms must be a positive integer"));
        return 2;
      }

      const registered = registry.getOperation(source, operation);
      const execution = timeoutMs === undefined && retryBudget === undefined
        ? undefined
        : {
            ...(timeoutMs === undefined ? {} : { timeoutMs }),
            ...(retryBudget === undefined ? {} : { retryBudget }),
          };
      const freshness = freshnessMode === undefined && maxAgeMs === undefined
        ? undefined
        : {
            mode: freshnessMode ?? "live",
            ...(maxAgeMs === undefined ? {} : { maxAgeMs }),
          } as const;
      const request = {
        requestId: randomUUID(),
        source,
        operation,
        parameters,
        ...(execution ? { execution } : {}),
        ...(freshness ? { freshness } : {}),
      };
      const result = await executeWithFreshness({
        request,
        operation: registered.descriptor,
        cache: dependencies.cache ?? new FileCache(),
        executeLive: (liveRequest) => registered.adapter.execute(
          liveRequest,
          { signal: new AbortController().signal, now },
        ),
        now,
      });
      writeJson(stdout, result);
      return failureExitCode(result);
    }

    writeJson(
      stderr,
      cliError(
        "invalid_cli_input",
        "expected sources, capabilities, run, doctor, research-cars, car-context collect, or context collect|compile command",
      ),
    );
    return 2;
  } catch (error) {
    const code = error instanceof SourceRegistryError ? error.code : "internal_cli_error";
    const message = error instanceof Error ? error.message : "unknown CLI error";
    writeJson(stderr, cliError(code, message));
    return error instanceof SourceRegistryError ? 2 : 1;
  }
}
