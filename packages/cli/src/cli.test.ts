import { describe, expect, it } from "vitest";

import { SourceRegistry } from "@sourceport/core";
import { FakeSourceAdapter } from "@sourceport/testing";

import { runCli } from "./cli.js";

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (value: string) => stdout.push(value),
      stderr: (value: string) => stderr.push(value),
    },
  };
}

function registry() {
  const value = new SourceRegistry();
  value.register(new FakeSourceAdapter());
  return value;
}

describe("SourcePort CLI", () => {
  it("lists sources and capabilities as stable JSON", async () => {
    const sources = capture();
    const sourceExit = await runCli(["sources"], { registry: registry(), ...sources.io });
    const capabilities = capture();
    const capabilityExit = await runCli(["capabilities", "fake"], {
      registry: registry(),
      ...capabilities.io,
    });

    expect(sourceExit).toBe(0);
    expect(JSON.parse(sources.stdout.join(""))).toEqual({
      sources: [expect.objectContaining({ source: "fake" })],
    });
    expect(capabilityExit).toBe(0);
    expect(JSON.parse(capabilities.stdout.join(""))).toEqual({
      source: "fake",
      operations: [expect.objectContaining({ operation: "echo" })],
    });
    expect(sources.stderr).toEqual([]);
  });

  it("runs a source operation and reserves stdout for the result", async () => {
    const output = capture();
    const exitCode = await runCli(
      ["run", "fake", "echo", "--input", JSON.stringify({ value: "x" })],
      { registry: registry(), ...output.io },
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(output.stdout.join(""))).toEqual(
      expect.objectContaining({ status: "success", data: { value: "x" } }),
    );
    expect(output.stderr).toEqual([]);
  });

  it("returns a non-zero exit code for invalid JSON input", async () => {
    const output = capture();
    const exitCode = await runCli(["run", "fake", "echo", "--input", "{"], {
      registry: registry(),
      ...output.io,
    });

    expect(exitCode).toBe(2);
    expect(output.stdout).toEqual([]);
    expect(JSON.parse(output.stderr.join(""))).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: "invalid_cli_input" }),
      }),
    );
  });
});
