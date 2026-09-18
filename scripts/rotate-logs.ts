import { lstat, readdir, rename, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

const [root, offline] = process.argv.slice(2);
if (!root || !isAbsolute(root) || offline !== "--offline") throw new Error("Stop the service, then run: npm run logs:rotate -- ABSOLUTE_LOG_DIRECTORY --offline");
const names = await readdir(root);
for (const name of names.filter((name) => /^[a-zA-Z0-9_.-]+\.(out|err)\.log$/.test(name))) {
  const path = join(root, name); const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Logs must be regular files.");
  if (stat.size < 10 * 1024 * 1024) continue;
  const suffix = String(Date.now());
  await rename(path, `${path}.${suffix}`);
  const archives = (await readdir(root)).filter((item) => item.startsWith(name + ".") && /^\d{13}$/.test(item.slice(name.length + 1))).sort().reverse();
  for (const old of archives.slice(7)) await unlink(join(root, old));
}
console.log("Log rotation completed; restart the service to open fresh log files.");
