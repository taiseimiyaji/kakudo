import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { chmod, copyFile, lstat, mkdir, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import postgres from "postgres";
import { z } from "zod";

const digest = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const safePath = z.string().refine((path) => !isAbsolute(path) && !path.includes("\\") && path.split("/").every((part) => part !== "" && part !== "." && part !== ".."));
const manifestSchema = z.object({ version: z.literal(1), createdAt: z.string(), databaseName: z.string(),
  databaseHash: z.string().regex(/^[a-f0-9]{64}$/), files: z.array(z.object({ path: safePath, hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()) }).strict();

export async function inventory(root: string): Promise<{ path: string; hash: string }[]> {
  const result: { path: string; hash: string }[] = [];
  async function visit(directory: string) {
    for (const name of (await readdir(directory)).sort()) {
      const path = join(directory, name); const stat = await lstat(path);
      if (stat.isSymbolicLink()) throw new Error("Storage symlinks cannot be backed up.");
      if (stat.isDirectory()) await visit(path);
      else if (stat.isFile()) result.push({ path: relative(root, path).split("\\").join("/"), hash: digest(await readFile(path)) });
      else throw new Error("Storage must contain only regular files and directories.");
    }
  }
  await visit(root);
  return result;
}

async function pgTool(tool: "pg_dump" | "pg_restore", url: string, args: string[]) {
  const parsed = new URL(url);
  // Credentials are passed through environment, never CLI arguments or diagnostic output.
  const env = { ...process.env, PGHOST: parsed.hostname, PGPORT: parsed.port || "5432", PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password), PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)), PGCONNECT_TIMEOUT: "5" };
  if (parsed.searchParams.get("sslmode")) Object.assign(env, { PGSSLMODE: parsed.searchParams.get("sslmode")! });
  const executable = join(process.env.PG_BIN_DIR ?? "", tool);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { env, stdio: "ignore" });
    child.once("error", () => reject(new Error(`${tool} could not start. Check PG_BIN_DIR.`)));
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${tool} failed; check PostgreSQL versions, permissions and connectivity.`)));
  });
}

export async function backup({ databaseUrl, storageRoot, destination }: { databaseUrl: string; storageRoot: string; destination: string }) {
  const source = await realpath(storageRoot);
  const output = resolve(destination);
  const parent = await realpath(dirname(output));
  const rel = relative(source, join(parent, basename(output)));
  if (rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel)) throw new Error("Backup destination must be outside content storage.");
  const db = postgres(databaseUrl, { max: 1, connect_timeout: 5, onnotice: () => {} });
  let created = false;
  try {
    const [pending] = await db`select count(*)::int as count from document_write_intents`;
    if (pending.count) throw new Error("Recover pending document writes before stopping the application and backing up.");
    await mkdir(output, { mode: 0o700 }); created = true;
    const files = await inventory(source);
    await mkdir(join(output, "content"), { mode: 0o700 });
    for (const file of files) {
      const target = join(output, "content", file.path);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await copyFile(join(source, file.path), target); await chmod(target, 0o600);
    }
    await pgTool("pg_dump", databaseUrl, ["--format=custom", "--no-owner", "--no-privileges", "--file", join(output, "database.dump")]);
    await chmod(join(output, "database.dump"), 0o600);
    if (JSON.stringify(files) !== JSON.stringify(await inventory(source)) || JSON.stringify(files) !== JSON.stringify(await inventory(join(output, "content")))) {
      throw new Error("Content changed during backup. Stop all writers and retry.");
    }
    const manifest = { version: 1, createdAt: new Date().toISOString(), databaseName: decodeURIComponent(new URL(databaseUrl).pathname.slice(1)),
      databaseHash: digest(await readFile(join(output, "database.dump"))), files };
    // Manifest is written last: its presence means the pair completed successfully.
    await writeFile(join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  } catch (error) { if (created) await rm(output, { recursive: true, force: true }); throw error; }
  finally { await db.end(); }
}

export async function restore({ source, databaseUrl, storageRoot }: { source: string; databaseUrl: string; storageRoot: string }) {
  const manifest = manifestSchema.parse(JSON.parse(await readFile(join(source, "manifest.json"), "utf8")));
  if (decodeURIComponent(new URL(databaseUrl).pathname.slice(1)) === manifest.databaseName) throw new Error("Restore requires a different database name.");
  if (digest(await readFile(join(source, "database.dump"))) !== manifest.databaseHash
    || JSON.stringify(await inventory(join(source, "content"))) !== JSON.stringify(manifest.files)) throw new Error("Backup checksum mismatch.");
  const target = resolve(storageRoot);
  const backupRoot = await realpath(source);
  const targetParent = await realpath(dirname(target));
  const relativeTarget = relative(backupRoot, join(targetParent, basename(target)));
  if (relativeTarget !== ".." && !relativeTarget.startsWith("../") && !isAbsolute(relativeTarget)) throw new Error("Restore destination must be outside the backup.");
  // Never merge into an existing directory, even an empty one.
  const db = postgres(databaseUrl, { max: 1, connect_timeout: 5, onnotice: () => {} });
  let created = false;
  try {
    const [objects] = await db`select count(*)::int as count from pg_namespace where nspname not in ('public', 'information_schema') and nspname not like 'pg_%'`;
    const [tables] = await db`select count(*)::int as count from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'`;
    if (objects.count || tables.count) throw new Error("Restore requires an empty target database.");
    await mkdir(target, { mode: 0o700 }); created = true;
    for (const file of manifest.files) {
      const path = join(target, file.path);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await copyFile(join(source, "content", file.path), path); await chmod(path, 0o600);
    }
    if (JSON.stringify(await inventory(target)) !== JSON.stringify(manifest.files)) throw new Error("Restored content checksum mismatch.");
    await pgTool("pg_restore", databaseUrl, ["--dbname", decodeURIComponent(new URL(databaseUrl).pathname.slice(1)), "--single-transaction", "--no-owner", "--no-privileges", join(source, "database.dump")]);
  } catch (error) { if (created) await rm(target, { recursive: true, force: true }); throw error; }
  finally { await db.end(); }
}
