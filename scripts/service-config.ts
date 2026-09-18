import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { parse } from "dotenv";

const [kind, configPath, output] = process.argv.slice(2);
if (!["launchd", "systemd"].includes(kind) || !configPath || !output || !isAbsolute(configPath) || !isAbsolute(output)) {
  throw new Error("Usage: npm run service:config -- launchd|systemd ABSOLUTE_ENV_FILE ABSOLUTE_OUTPUT");
}
if (process.versions.node.split(".")[0] !== "24") throw new Error("Use Node.js 24 to generate service configuration.");
const config = parse(await readFile(configPath));
if (!config.DATABASE_URL || !config.CONTENT_STORAGE_ROOT || !isAbsolute(config.CONTENT_STORAGE_ROOT)) throw new Error("Service config requires DATABASE_URL and an absolute CONTENT_STORAGE_ROOT.");
const root = await realpath(process.cwd());
const node = await realpath(process.execPath);
const label = process.env.KAKUDO_SERVICE_LABEL ?? "local.kakudo";
if (!/^[a-zA-Z0-9_.-]+$/.test(label)) throw new Error("Invalid service label.");
const logs = join(root, ".local", "logs");
await mkdir(logs, { recursive: true, mode: 0o700 });
const args = [node, `--env-file=${configPath}`, join(root, "dist/server/index.mjs")];
const xml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const systemd = (value: string) => '"' + value.replaceAll("%", "%%").replaceAll("\\", "\\\\").replaceAll('"', '\\"') + '"';
const content = kind === "launchd" ? `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${xml(label)}</string>
<key>ProgramArguments</key><array>${args.map((arg) => `<string>${xml(arg)}</string>`).join("")}</array>
<key>WorkingDirectory</key><string>${xml(root)}</string>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(dirname(node))}:/usr/bin:/bin:/usr/sbin:/sbin</string><key>NODE_ENV</key><string>production</string></dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer>
<key>StandardOutPath</key><string>${xml(join(logs, label + ".out.log"))}</string>
<key>StandardErrorPath</key><string>${xml(join(logs, label + ".err.log"))}</string>
</dict></plist>
` : `[Unit]
Description=Kakudo learning workspace
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
WorkingDirectory=${systemd(root)}
ExecStart=${args.map(systemd).join(" ")}
Environment=NODE_ENV=production
Restart=always
RestartSec=10
TimeoutStopSec=15
KillMode=control-group

[Install]
WantedBy=default.target
`;
await writeFile(output, content, { flag: "wx", mode: 0o600 });
console.log(`Service configuration written: ${output}`);
