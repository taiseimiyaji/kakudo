import { randomUUID } from "node:crypto";
import { open, statfs, unlink } from "node:fs/promises";
import { join } from "node:path";

export type StorageHealth = { status: "writable"; freeBytes: number };
export async function checkStorageHealth(root: string, minimumFreeBytes = 100 * 1024 * 1024): Promise<StorageHealth> {
  if (!Number.isSafeInteger(minimumFreeBytes) || minimumFreeBytes < 0) throw new Error("Invalid storage threshold.");
  const stats = await statfs(root);
  const freeBytes = stats.bavail * stats.bsize;
  if (freeBytes < minimumFreeBytes) throw Object.assign(new Error("Storage capacity below threshold"), { code: "ENOSPC" });
  const path = join(root, `.kakudo-health-${randomUUID()}`);
  const file = await open(path, "wx", 0o600);
  try { await file.writeFile("health probe\n"); await file.sync(); }
  finally { await file.close(); await unlink(path); }
  return { status: "writable", freeBytes };
}
