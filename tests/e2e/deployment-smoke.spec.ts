import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test("deployment smoke checks the running API with explicit Mock and cleans its document", async ({ baseURL, request }) => {
  const root = await mkdtemp(join(tmpdir(), "kakudo-smoke-note-"));
  try {
    const note = join(root, "verification.md");
    await writeFile(note, "OAuthは認証プロトコルである。");
    const { stdout } = await promisify(execFile)(process.execPath, ["--import", "tsx", "scripts/deployment-smoke.ts"], {
      env: { ...process.env, SMOKE_BASE_URL: baseURL, SMOKE_MARKDOWN_PATH: note, SMOKE_EXPECT_PROVIDER: "mock" }, timeout: 25000,
    });
    const result = JSON.parse(stdout.trim());
    expect(result).toMatchObject({ provider: "mock", status: "COMPLETED", stale: true, contentUnchangedByReview: true });
    expect((await request.get(`/api/reviews/${result.reviewId}`)).status()).toBe(404);
  } finally { await rm(root, { recursive: true, force: true }); }
});
