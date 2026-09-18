import { chmod, mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { checkStorageHealth } from "../../modules/operations/health";

it("checks real write access and available capacity without leaving probe files", async () => {
  const root = await mkdtemp(join(tmpdir(), "kakudo-health-"));
  try {
    expect(await checkStorageHealth(root, 0)).toMatchObject({ status: "writable", freeBytes: expect.any(Number) });
    expect(await readdir(root)).toEqual([]);
    await expect(checkStorageHealth(root, Number.MAX_SAFE_INTEGER)).rejects.toMatchObject({ code: "ENOSPC" });
    await expect(checkStorageHealth(join(root, "missing"))).rejects.toMatchObject({ code: "ENOENT" });
    if (process.getuid?.() !== 0) {
      await chmod(root, 0o500);
      await expect(checkStorageHealth(root, 0)).rejects.toMatchObject({ code: "EACCES" });
    }
  } finally { await chmod(root, 0o700); await rm(root, { recursive: true, force: true }); }
});
