import { describe, expect, it } from "vitest";
import { readDatabaseUrl, readTestDatabaseUrl } from "../../lib/env";

describe("database configuration", () => {
  it("accepts PostgreSQL URLs", () => {
    const url = "postgresql://user:password@localhost/kakudo";
    expect(readDatabaseUrl({ DATABASE_URL: url })).toBe(url);
  });
  it.each([undefined, "not-a-url", "https://example.com"])('rejects invalid application URL %s', (url) => {
    expect(() => readDatabaseUrl({ DATABASE_URL: url })).toThrow("DATABASE_URL");
  });
  it("does not disclose invalid credentials in errors", () => {
    expect(() => readDatabaseUrl({ DATABASE_URL: "https://user:secret@example.com" })).toThrow(/^DATABASE_URL must be a valid PostgreSQL URL\. See \.env\.example\.$/);
  });
  it("requires an explicit isolated test database", () => {
    expect(() => readTestDatabaseUrl({})).toThrow("explicitly");
    expect(() => readTestDatabaseUrl({ TEST_DATABASE_URL: "postgres://localhost/kakudo" })).toThrow("_test");
    expect(() => readTestDatabaseUrl({ DATABASE_URL: "postgresql://a@localhost/shared_test", TEST_DATABASE_URL: "postgres://b@localhost:5432/shared_test" })).toThrow("separate");
    expect(readTestDatabaseUrl({ TEST_DATABASE_URL: "postgres://localhost/kakudo_test" })).toBe("postgres://localhost/kakudo_test");
  });
});
