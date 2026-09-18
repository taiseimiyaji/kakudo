import { describe, expect, it } from "vitest";
import { readE2eDatabaseUrl, requireE2eRunner } from "../../lib/e2e-env";

describe("E2E isolation", () => {
  it("rejects missing configuration and shared names even through host aliases", () => {
    expect(() => readE2eDatabaseUrl({})).toThrow("explicitly");
    expect(() => readE2eDatabaseUrl({ E2E_DATABASE_URL: "postgres://localhost/kakudo" })).toThrow("_e2e_test");
    for (const key of ["DATABASE_URL", "TEST_DATABASE_URL"]) {
      expect(() => readE2eDatabaseUrl({ [key]: "postgres://localhost/shared_e2e_test", E2E_DATABASE_URL: "postgres://127.0.0.1/shared_e2e_test" })).toThrow("separate");
    }
    expect(readE2eDatabaseUrl({ E2E_DATABASE_URL: "postgres://localhost/browser_e2e_test", TEST_DATABASE_URL: "postgres://localhost/kakudo_test" })).toContain("browser_e2e_test");
  });
  it("rejects direct Playwright runs or inherited operational storage", () => {
    expect(() => requireE2eRunner({})).toThrow("npm run");
    expect(() => requireE2eRunner({ KAKUDO_E2E_RUN: "kakudo-e2e-one", CONTENT_STORAGE_ROOT: "./workspace-data" })).toThrow();
    expect(() => requireE2eRunner({ KAKUDO_E2E_RUN: "kakudo-e2e-one", CONTENT_STORAGE_ROOT: "/tmp/kakudo-e2e-one", DATABASE_URL: "postgres://localhost/ops", KAKUDO_E2E_DATABASE_URL: "postgres://localhost/test_e2e_test" })).toThrow();
  });
});
