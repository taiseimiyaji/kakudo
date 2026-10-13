import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

const script = resolve("scripts/ci-browser-port.sh");

function runWithTools(ss?: string, ps?: string, commandExit = 0) {
  const bin = mkdtempSync(join(tmpdir(), "kakudo-ci-port-"));
  try {
    for (const [name, source] of [["ss", ss], ["ps", ps]] as const) {
      if (source === undefined) continue;
      const path = join(bin, name);
      writeFileSync(path, `#!/bin/sh\n${source}\n`);
      chmodSync(path, 0o755);
    }
    return spawnSync("/bin/bash", [script, "/bin/bash", "-c", `exit ${commandExit}`], {
      encoding: "utf8", env: { PATH: bin },
    });
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
}

const occupied = "printf '%s\\n' 'LISTEN 0 511 127.0.0.1:43172 0.0.0.0:* users:((\"SECRET_NOT_FOR_LOG\",pid=2345,fd=18))'";
const owner = '[ "$1" = "-p" ] && [ "$2" = "2345" ] && [ "$3" = "-o" ] && [ "$4" = "pid=,ppid=,lstart=,comm=" ] || exit 3\nprintf "%s\\n" "2345 99 Tue Oct 13 10:00:00 2026 node"';

it("records only occupied port state and allowed owner fields from a mock listener", () => {
  const result = runWithTools(occupied, owner);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("before 43172 listener=occupied");
  expect(result.stdout).toContain("pid_ppid_start_comm=2345 99 Tue Oct 13 10:00:00 2026 node");
  expect(result.stdout).not.toContain("SECRET_NOT_FOR_LOG");
  expect(result.stdout).not.toContain("after_failure");
});

it("reports an empty port without querying process details", () => {
  const result = runWithTools("exit 0", "exit 9");
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("before 43172 listener=empty");
  expect(result.stdout).not.toContain("process_details_unavailable");
});

it("reports missing diagnostic tools without affecting the command", () => {
  const missingSs = runWithTools();
  expect(missingSs.status).toBe(0);
  expect(missingSs.stdout).toContain("diagnostic_unavailable=ss_missing");
  const missingPs = runWithTools(occupied);
  expect(missingPs.status).toBe(0);
  expect(missingPs.stdout).toContain("listener=occupied");
  expect(missingPs.stdout).toContain("process_details_unavailable=ps_missing");
});

it("keeps the browser command's failing exit code even if diagnostics fail", () => {
  const result = runWithTools("exit 42", undefined, 23);
  expect(result.status).toBe(23);
  expect(result.stdout.match(/diagnostic_unavailable=ss_failed/g)).toHaveLength(2);
  expect(result.stdout).toContain("after_failure");
});
