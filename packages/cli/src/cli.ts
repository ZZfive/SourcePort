import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { AutohomeAdapter } from "@sourceport/autohome";
import {
  createRegistrySourceExecutor,
  renderCarResearchMarkdown,
  researchCars,
  validateCarResearchBrief,
  type CarResearchReport,
  type SourceExecutor,
} from "@sourceport/car-research";
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
      if (format === "md") {
        stdout(renderCarResearchMarkdown(report));
      } else {
        writeJson(stdout, report);
      }
      return researchExitCode(report);
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
        "expected sources, capabilities, run, doctor, or research-cars command",
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
