import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { inventory, backup } from "../../modules/operations/backup";

it("rejects symlinks and nested backup destinations without connecting to a DB", async () => {
  const root = await mkdtemp(join(tmpdir(), "kakudo-backup-unit-"));
  try {
    const source = join(root, "content"); await mkdir(source); await writeFile(join(source, "note.md"), "note");
    await expect(backup({ databaseUrl: "postgres://invalid/db", storageRoot: source, destination: join(source, "backup") })).rejects.toThrow("outside");
    await symlink(source, join(root, "alias"));
    await expect(backup({ databaseUrl: "postgres://invalid/db", storageRoot: source, destination: join(root, "alias", "backup") })).rejects.toThrow("outside");
    await symlink(join(source, "note.md"), join(source, "link.md"));
    await expect(inventory(source)).rejects.toThrow("symlink");
  } finally { await rm(root, { recursive: true, force: true }); }
});
