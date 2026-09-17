import { mkdtemp, readFile, rm, symlink, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalFileSystemStorage } from "../../modules/storage/local";
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function setup() { const root = await mkdtemp(join(tmpdir(), "kakudo-storage-")); roots.push(root); return { root, storage: new LocalFileSystemStorage(root) }; }
describe("LocalFileSystemStorage", () => {
  it("preserves Markdown bytes and performs atomic replacement", async () => {
    const { root, storage } = await setup(); const path = "default/docs/test.md";
    const text = "---\r\nid: test\r\ntitle: 日本語\r\n---\r\n\r\n# 自分のノート\r\n```ts\r\nconst x = 1\r\n```\r\n";
    expect(await storage.exists(path)).toBe(false);
    await storage.write(path, text); expect(await storage.read(path)).toBe(text);
    expect(await readFile(join(root, path), "utf8")).toBe(text);
    await storage.write(path, "edited"); expect(await storage.read(path)).toBe("edited");
    await storage.delete(path); expect(await storage.exists(path)).toBe(false);
  });
  it("rejects absolute paths, traversal and symlink escape", async () => {
    const { root, storage } = await setup(); const outside = await mkdtemp(join(tmpdir(), "kakudo-outside-")); roots.push(outside);
    for (const path of ["../secret", "/tmp/secret", "docs/../../secret", "docs\\secret", "docs//note.md"]) await expect(storage.write(path, "x")).rejects.toThrow();
    await symlink(outside, join(root, "escape")); await expect(storage.write("escape/test.md", "x")).rejects.toThrow("Unsafe");
    await mkdir(join(root, "docs")); await symlink(join(outside, "target.md"), join(root, "docs/link.md"));
    await expect(storage.read("docs/link.md")).rejects.toThrow("Unsafe");
    await expect(storage.write("docs/link.md", "x")).rejects.toThrow("Unsafe");
    await expect(storage.delete("docs/link.md")).rejects.toThrow("Unsafe");
  });
});
