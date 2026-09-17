import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { ContentStorage } from "./content-storage";

function missing(error: unknown) { return (error as NodeJS.ErrnoException).code === "ENOENT"; }
export class LocalFileSystemStorage implements ContentStorage {
  private root: Promise<string>;
  constructor(root: string) {
    this.root = mkdir(resolve(root), { recursive: true, mode: 0o700 }).then(() => realpath(resolve(root)));
  }
  private async safePath(path: string, create = false) {
    const parts = path.split("/");
    if (isAbsolute(path) || path.includes("\\") || parts.some((part) => !/^[a-zA-Z0-9_-][a-zA-Z0-9_.:-]*$/.test(part) || part === "." || part === "..")) throw new Error("Invalid storage path");
    let current = await this.root;
    for (const [index, part] of parts.entries()) {
      current = join(current, part);
      const directory = index < parts.length - 1;
      let info;
      try { info = await lstat(current); } catch (error) {
        if (!missing(error)) throw error;
        if (directory && create) { await mkdir(current, { mode: 0o700 }).catch((e) => { if (e.code !== "EEXIST") throw e; }); info = await lstat(current); }
      }
      if (info?.isSymbolicLink() || (info && directory && !info.isDirectory()) || (info && !directory && !info.isFile())) throw new Error("Unsafe storage path");
    }
    return current;
  }
  async read(path: string) {
    const file = await open(await this.safePath(path), constants.O_RDONLY | constants.O_NOFOLLOW);
    try { if (!(await file.stat()).isFile()) throw new Error("Expected a regular file"); return await file.readFile("utf8"); }
    finally { await file.close(); }
  }
  async write(path: string, content: string) {
    const target = await this.safePath(path, true);
    const temp = join(dirname(target), `.kakudo-${randomUUID()}.tmp`);
    const file = await open(temp, "wx", 0o600);
    try {
      await file.writeFile(content, "utf8"); await file.sync(); await file.close();
      await this.safePath(path); // Reject symlinks before committing the rename.
      await rename(temp, target);
    } catch (error) { await file.close().catch(() => {}); await unlink(temp).catch(() => {}); throw error; }
  }
  async delete(path: string) { try { await unlink(await this.safePath(path)); } catch (error) { if (!missing(error)) throw error; } }
  async exists(path: string) { try { const file = await open(await this.safePath(path), constants.O_RDONLY | constants.O_NOFOLLOW); await file.close(); return true; } catch (error) { if (missing(error)) return false; throw error; } }
}
let storage: ContentStorage | undefined;
export function getContentStorage() { return storage ??= new LocalFileSystemStorage(process.env.CONTENT_STORAGE_ROOT ?? "./workspace-data"); }
