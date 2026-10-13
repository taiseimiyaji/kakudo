import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

const script = resolve("scripts/ci-browser-port.sh");
const timeoutTool = `#!${process.execPath}
const { spawn } = require("node:child_process");
const args = process.argv.slice(2);
if (args[0] !== "-k" || args[1] !== "1s" || args[2] !== "2s") process.exit(91);
const child = spawn(args[3], args.slice(4), { stdio: "inherit", env: process.env });
let expired = false;
const term = setTimeout(() => { expired = true; child.kill("SIGTERM"); }, 500);
const kill = setTimeout(() => child.kill("SIGKILL"), 750);
child.on("error", () => process.exit(127));
child.on("exit", (code, signal) => {
  clearTimeout(term); clearTimeout(kill);
  process.exit(expired ? 124 : code ?? (signal === "SIGTERM" ? 143 : 137));
});
`;
const hangingTool = `#!${process.execPath}
process.on("SIGTERM", () => {});
setTimeout(() => process.exit(0), 2500);
`;
const occupied = "printf '%s\\n' 'LISTEN 0 511 127.0.0.1:43172 0.0.0.0:* users:((\"SECRET_NOT_FOR_LOG\",pid=2345,fd=18))'";
const owner = '[ "$1" = "-p" ] && [ "$2" = "2345" ] && [ "$3" = "-o" ] && [ "$4" = "pid=,ppid=,lstart=,comm=" ] || exit 3\nprintf "%s\\n" "2345 99 Tue Oct 13 10:00:00 2026 node"';

function runWithTools({ ss, ps, timeout = true, commandExit = 0, signal }: {
  ss?: string; ps?: string; timeout?: boolean; commandExit?: number; signal?: "SIGINT" | "SIGTERM";
} = {}) {
  const bin = mkdtempSync(join(tmpdir(), "kakudo-ci-port-"));
  try {
    for (const [name, source] of [["ss", ss], ["ps", ps], ["timeout", timeout ? timeoutTool : undefined]] as const) {
      if (source === undefined) continue;
      const path = join(bin, name);
      writeFileSync(path, source.startsWith("#!") ? source : `#!/bin/sh\n${source}\n`);
      chmodSync(path, 0o755);
    }
    const command = signal
      ? [process.execPath, "-e", `process.kill(process.pid, ${JSON.stringify(signal)})`]
      : ["/bin/bash", "-c", `exit ${commandExit}`];
    const started = Date.now();
    const result = spawnSync("/bin/bash", [script, ...command], {
      encoding: "utf8", env: { PATH: bin }, timeout: 6500, killSignal: "SIGKILL",
    });
    return { ...result, durationMs: Date.now() - started };
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
}

it("records only occupied port state and allowed owner fields from a mock listener", () => {
  const result = runWithTools({ ss: occupied, ps: owner });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("before 43172 listener=occupied");
  expect(result.stdout).toContain("pid_ppid_start_comm=2345 99 Tue Oct 13 10:00:00 2026 node");
  expect(result.stdout).not.toContain("SECRET_NOT_FOR_LOG");
  expect(result.stdout).not.toContain("after_failure");
});

it("reports an empty port without querying process details", () => {
  const result = runWithTools({ ss: "exit 0", ps: "exit 9" });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("before 43172 listener=empty");
  expect(result.stdout).not.toContain("process_details_unavailable");
});

it("skips diagnostics when timeout is missing and reports missing ss or ps", () => {
  const missingTimeout = runWithTools({ ss: occupied, timeout: false });
  expect(missingTimeout.status).toBe(0);
  expect(missingTimeout.stdout).toContain("diagnostic_unavailable=timeout_missing");
  const missingTimeoutAfterFailure = runWithTools({ ss: occupied, timeout: false, commandExit: 23 });
  expect(missingTimeoutAfterFailure.status).toBe(23);
  expect(missingTimeoutAfterFailure.stdout.match(/diagnostic_unavailable=timeout_missing/g)).toHaveLength(2);
  const missingSs = runWithTools();
  expect(missingSs.status).toBe(0);
  expect(missingSs.stdout).toContain("diagnostic_unavailable=ss_missing");
  const missingPs = runWithTools({ ss: occupied });
  expect(missingPs.status).toBe(0);
  expect(missingPs.stdout).toContain("process_details_unavailable=ps_missing");
});

it("keeps the browser command's failing exit code even if diagnostics fail", () => {
  const result = runWithTools({ ss: "exit 42", commandExit: 23 });
  expect(result.status).toBe(23);
  expect(result.stdout.match(/diagnostic_unavailable=ss_failed/g)).toHaveLength(2);
  expect(result.stdout).toContain("after_failure");
});

it("bounds a hung ss without delaying a successful browser command indefinitely", () => {
  const result = runWithTools({ ss: hangingTool });
  expect(result.status).toBe(0);
  expect(result.durationMs).toBeLessThan(1800);
  expect(result.stdout).toContain("diagnostic_unavailable=ss_failed");
});

it("bounds a hung ps on both snapshots and keeps browser exit code 23", () => {
  const result = runWithTools({ ss: occupied, ps: hangingTool, commandExit: 23 });
  expect(result.status).toBe(23);
  expect(result.durationMs).toBeLessThan(3000);
  expect(result.stdout.match(/process_details_unavailable pid=2345/g)).toHaveLength(2);
  expect(result.stdout).toContain("after_failure");
});

for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]] as const) {
  it(`preserves a browser exit caused by ${signal}`, () => {
    const result = runWithTools({ ss: "exit 0", signal });
    expect(result.status).toBe(code);
    expect(result.stdout).toContain("after_failure 43172 listener=empty");
  });
}
