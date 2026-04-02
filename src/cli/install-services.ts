import "dotenv/config";

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { ROOT_DIR } from "@/lib/constants";

const args = new Set(process.argv.slice(2));
const serviceMode = args.has("--system") ? "system" : "user";
const autoYes = args.has("--yes");
const port = process.env.PORT ?? "3000";
const schedulerIntervalMs = process.env.SMARTCLAW_SCHEDULER_INTERVAL_MS ?? "60000";

function quoteSystemdValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getServiceDirectory(): string {
  if (serviceMode === "system") {
    return "/etc/systemd/system";
  }

  return path.join(os.homedir(), ".config", "systemd", "user");
}

function webServiceName(): string {
  return "smartclaw-web.service";
}

function schedulerServiceName(): string {
  return "smartclaw-scheduler.service";
}

function renderWebService(): string {
  return `[Unit]
Description=SmartClaw web runtime
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${quoteSystemdValue(ROOT_DIR)}
Environment=NODE_ENV=production
Environment=PORT=${quoteSystemdValue(port)}
ExecStart=/usr/bin/env pnpm start -- --hostname 0.0.0.0 --port ${quoteSystemdValue(port)}
Restart=always
RestartSec=5

[Install]
WantedBy=${serviceMode === "system" ? "multi-user.target" : "default.target"}
`;
}

function renderSchedulerService(): string {
  return `[Unit]
Description=SmartClaw scheduler daemon
After=network-online.target smartclaw-web.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${quoteSystemdValue(ROOT_DIR)}
Environment=NODE_ENV=production
ExecStart=/usr/bin/env pnpm scheduler -- --daemon --interval-ms=${quoteSystemdValue(schedulerIntervalMs)}
Restart=always
RestartSec=5

[Install]
WantedBy=${serviceMode === "system" ? "multi-user.target" : "default.target"}
`;
}

async function runCommand(command: string, commandArgs: string[]): Promise<number> {
  const commandLine = [command, ...commandArgs]
    .map((part) => {
      if (/^[a-zA-Z0-9_./:=+-]+$/.test(part)) {
        return part;
      }

      return `"${part.replace(/"/g, '\\"')}"`;
    })
    .join(" ");

  return new Promise((resolve, reject) => {
    const child = spawn(commandLine, {
      cwd: ROOT_DIR,
      stdio: "inherit",
      shell: true,
      env: process.env,
    });

    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function ensureBuild(): Promise<void> {
  const nextBuildId = path.join(ROOT_DIR, ".next", "BUILD_ID");

  try {
    await fs.access(nextBuildId);
  } catch {
    const code = await runCommand("pnpm", ["build"]);
    if (code !== 0) {
      throw new Error("`pnpm build` failed, so startup services were not installed.");
    }
  }
}

async function installServiceFiles(): Promise<string[]> {
  const serviceDir = getServiceDirectory();
  await fs.mkdir(serviceDir, { recursive: true });

  const webPath = path.join(serviceDir, webServiceName());
  const schedulerPath = path.join(serviceDir, schedulerServiceName());

  await fs.writeFile(webPath, renderWebService(), "utf8");
  await fs.writeFile(schedulerPath, renderSchedulerService(), "utf8");

  return [webPath, schedulerPath];
}

async function enableServices(): Promise<void> {
  const systemctlArgsBase = serviceMode === "system" ? [] : ["--user"];

  let code = await runCommand("systemctl", [...systemctlArgsBase, "daemon-reload"]);
  if (code !== 0) {
    throw new Error("`systemctl daemon-reload` failed.");
  }

  code = await runCommand("systemctl", [
    ...systemctlArgsBase,
    "enable",
    "--now",
    webServiceName(),
    schedulerServiceName(),
  ]);

  if (code !== 0) {
    throw new Error("`systemctl enable --now` failed.");
  }
}

async function maybeEnableLinger(): Promise<void> {
  if (serviceMode !== "user" || process.platform !== "linux") {
    return;
  }

  const username = os.userInfo().username;
  if (!autoYes) {
    console.log("");
    console.log(
      `For user services to start at boot before login, run: sudo loginctl enable-linger ${username}`,
    );
    return;
  }

  await runCommand("loginctl", ["enable-linger", username]);
}

async function main() {
  if (process.platform !== "linux") {
    console.log("SmartClaw boot services are primarily implemented for Debian/systemd Linux.");
    console.log("This command can still generate service files on Linux-compatible environments only.");
    process.exit(1);
  }

  console.log("Installing SmartClaw startup services");
  console.log(`Mode: ${serviceMode}`);
  console.log(`Workspace: ${ROOT_DIR}`);
  console.log("");

  await ensureBuild();
  const writtenFiles = await installServiceFiles();
  await enableServices();
  await maybeEnableLinger();

  console.log("");
  console.log("Installed systemd units:");
  for (const file of writtenFiles) {
    console.log(`- ${file}`);
  }
  console.log("");
  console.log("Services enabled:");
  console.log(`- ${webServiceName()}`);
  console.log(`- ${schedulerServiceName()}`);
  console.log("");
  console.log("Webhook-based adapters such as Telegram, Slack, Discord, GitHub, Teams, Google Chat, and Linear will now be available after boot as long as the SmartClaw web service is reachable and configured.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
