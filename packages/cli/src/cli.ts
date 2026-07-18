import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { AutohomeAdapter } from "@sourceport/autohome";
import {
  SourceRegistry,
  SourceRegistryError,
  type SourceResult,
} from "@sourceport/core";
import { DongchediAdapter } from "@sourceport/dongchedi";

export interface CliDependencies {
  registry?: SourceRegistry;
  stdout?: (value: string) => void;
  stderr?: (value: string) => void;
  now?: () => Date;
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

      const registered = registry.getOperation(source, operation);
      const execution = timeoutMs === undefined && retryBudget === undefined
        ? undefined
        : {
            ...(timeoutMs === undefined ? {} : { timeoutMs }),
            ...(retryBudget === undefined ? {} : { retryBudget }),
          };
      const result = await registered.adapter.execute(
        {
          requestId: randomUUID(),
          source,
          operation,
          parameters,
          ...(execution ? { execution } : {}),
        },
        { signal: new AbortController().signal, now },
      );
      writeJson(stdout, result);
      return failureExitCode(result);
    }

    writeJson(
      stderr,
      cliError("invalid_cli_input", "expected sources, capabilities, or run command"),
    );
    return 2;
  } catch (error) {
    const code = error instanceof SourceRegistryError ? error.code : "internal_cli_error";
    const message = error instanceof Error ? error.message : "unknown CLI error";
    writeJson(stderr, cliError(code, message));
    return error instanceof SourceRegistryError ? 2 : 1;
  }
}
