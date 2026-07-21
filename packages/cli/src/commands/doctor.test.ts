import { describe, expect, it } from "vitest";

import { SourceRegistry } from "@sourceport/core";
import { FakeSourceAdapter } from "@sourceport/testing";

import { runCli } from "../cli.js";

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

function registry(adapter = new FakeSourceAdapter()) {
  const value = new SourceRegistry();
  value.register(adapter);
  return value;
}

class BlockedFakeSourceAdapter extends FakeSourceAdapter {
  override async health(runtime: Parameters<FakeSourceAdapter["health"]>[0]) {
    const report = await super.health(runtime);
    const backend = report.operations[0]!.backends[0]!;
    backend.state = "blocked";
    backend.available = false;
    backend.issueCode = "human_verification_required";
    backend.message = "complete verification";
    backend.recoveryActions = [{
      kind: "complete_human_verification",
      description: "complete verification",
      requiresUser: true,
    }];
    report.operations[0]!.state = "blocked";
    report.operations[0]!.available = false;
    report.operations[0]!.recoveryActions = backend.recoveryActions;
    report.state = "blocked";
    report.available = false;
    report.recoveryActions = backend.recoveryActions;
    return report;
  }
}

describe("sourceport doctor", () => {
  it("prints a stable JSON report for one source", async () => {
    const output = capture();
    const exitCode = await runCli(["doctor", "fake", "--json"], {
      registry: registry(),
      now: () => new Date("2026-07-20T00:00:00.000Z"),
      ...output.io,
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(output.stdout.join(""))).toEqual(expect.objectContaining({
      checkedAt: "2026-07-20T00:00:00.000Z",
      state: "healthy",
      sources: [expect.objectContaining({ source: "fake", state: "healthy" })],
    }));
    expect(output.stderr).toEqual([]);
  });

  it("prints human-readable source, operation, backend, and circuit state", async () => {
    const output = capture();
    const exitCode = await runCli(["doctor", "fake"], {
      registry: registry(),
      now: () => new Date("2026-07-20T00:00:00.000Z"),
      ...output.io,
    });

    expect(exitCode).toBe(0);
    expect(output.stdout.join("")).toContain("fake (Fake Source): healthy");
    expect(output.stdout.join("")).toContain("fake-memory [public-http/acquisition]");
    expect(output.stdout.join("")).toContain("circuit=closed");
  });

  it("returns exit code 3 when any backend is blocked", async () => {
    const output = capture();
    const exitCode = await runCli(["doctor", "fake", "--json"], {
      registry: registry(new BlockedFakeSourceAdapter()),
      ...output.io,
    });

    expect(exitCode).toBe(3);
    expect(JSON.parse(output.stdout.join("")).state).toBe("blocked");
  });

  it("rejects invalid timeout values before probing", async () => {
    const output = capture();
    const exitCode = await runCli(["doctor", "fake", "--timeout-ms", "0"], {
      registry: registry(),
      ...output.io,
    });

    expect(exitCode).toBe(2);
    expect(JSON.parse(output.stderr.join(""))).toEqual(expect.objectContaining({
      error: expect.objectContaining({ code: "invalid_cli_input" }),
    }));
  });
});
