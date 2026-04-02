import "dotenv/config";

import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { ROOT_DIR } from "@/lib/constants";
import { ensureRuntimeState } from "@/lib/store";

const ENV_EXAMPLE = path.join(ROOT_DIR, ".env.example");
const ENV_LOCAL = path.join(ROOT_DIR, ".env.local");
const CLI_ARGS = new Set(process.argv.slice(2));
const AUTO_YES = CLI_ARGS.has("--yes");
const SKIP_VERCEL_PULL = CLI_ARGS.has("--skip-vercel-pull");
const SKIP_BOOTSTRAP = CLI_ARGS.has("--skip-bootstrap");
const SKIP_BUILD = CLI_ARGS.has("--skip-build");

function parseEnvKeys(contents: string): Set<string> {
  return new Set(
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
      .map((line) => line.split("=")[0]!),
  );
}

async function commandExists(command: string): Promise<boolean> {
  const tool = process.platform === "win32" ? "where.exe" : "which";

  return new Promise((resolve) => {
    const child = spawn(tool, [command], { stdio: "ignore", windowsHide: true });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

async function runCommand(command: string, args: string[]): Promise<number> {
  const commandLine = [command, ...args]
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
      windowsHide: false,
      env: process.env,
    });

    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function askYesNo(
  rl: ReturnType<typeof createInterface>,
  question: string,
  defaultYes = true,
): Promise<boolean> {
  if (AUTO_YES || !input.isTTY) {
    console.log(`${question} ${defaultYes ? "[auto: yes]" : "[auto: no]"}`);
    return defaultYes;
  }

  const suffix = defaultYes ? " [Y/n] " : " [y/N] ";
  let answer = "";

  try {
    answer = (await rl.question(question + suffix)).trim().toLowerCase();
  } catch {
    return defaultYes;
  }

  if (!answer) {
    return defaultYes;
  }

  return answer === "y" || answer === "yes";
}

async function ensureEnvFile(): Promise<void> {
  try {
    await fs.access(ENV_LOCAL);
  } catch {
    const template = await fs.readFile(ENV_EXAMPLE, "utf8");
    await fs.writeFile(ENV_LOCAL, template, "utf8");
  }
}

async function summarizeEnvStatus(): Promise<{
  expected: string[];
  present: string[];
  missing: string[];
  hasAiAuth: boolean;
}> {
  const template = await fs.readFile(ENV_EXAMPLE, "utf8");
  const local = await fs.readFile(ENV_LOCAL, "utf8");

  const expected = [...parseEnvKeys(template)].sort();
  const localKeys = parseEnvKeys(local);
  const present = expected.filter((key) => localKeys.has(key));
  const missing = expected.filter((key) => !localKeys.has(key));
  const hasAiAuth =
    /(^|\n)VERCEL_OIDC_TOKEN=.+/m.test(local) || /(^|\n)AI_GATEWAY_API_KEY=.+/m.test(local);

  return {
    expected,
    present,
    missing,
    hasAiAuth,
  };
}

async function main() {
  await ensureRuntimeState();
  const rl = createInterface({ input, output });

  try {
    console.log("SmartClaw setup wizard");
    console.log(`Workspace: ${ROOT_DIR}`);
    console.log("Target platform: Debian first, but the setup also aims to work on other platforms.");
    console.log("");

    await ensureEnvFile();
    const hasVercel = await commandExists("vercel");

    if (SKIP_VERCEL_PULL) {
      console.log("Skipping `vercel env pull` because --skip-vercel-pull was provided.");
    } else if (hasVercel) {
      const wantsPull = await askYesNo(
        rl,
        "Pull fresh environment variables from Vercel into .env.local?",
        true,
      );

      if (wantsPull) {
        try {
          const code = await runCommand("vercel", ["env", "pull", ".env.local", "--yes"]);
          if (code !== 0) {
            console.log("");
            console.log("Vercel env pull did not complete successfully. Continuing with local setup.");
          }
        } catch {
          console.log("");
          console.log("Vercel CLI could not be executed. Continuing with local setup.");
        }
      }
    } else {
      console.log("Vercel CLI was not found. Skipping `vercel env pull`.");
    }

    const envStatus = await summarizeEnvStatus();

    console.log("");
    console.log(`Env template keys: ${envStatus.expected.length}`);
    console.log(`Env keys present locally: ${envStatus.present.length}`);
    console.log(`AI auth configured: ${envStatus.hasAiAuth ? "yes" : "no"}`);

    if (!envStatus.hasAiAuth) {
      console.log("");
      console.log("Add either VERCEL_OIDC_TOKEN via `vercel env pull` or AI_GATEWAY_API_KEY to use the model.");
    }

    console.log("");
    console.log("Desktop and runtime files are ready.");

    if (!SKIP_BOOTSTRAP && (await askYesNo(rl, "Run `pnpm bootstrap` now?", true))) {
      await runCommand("pnpm", ["bootstrap"]);
    } else if (SKIP_BOOTSTRAP) {
      console.log("Skipping bootstrap because --skip-bootstrap was provided.");
    }

    if (!SKIP_BUILD && (await askYesNo(rl, "Run `pnpm build` to verify the install?", true))) {
      await runCommand("pnpm", ["build"]);
    } else if (SKIP_BUILD) {
      console.log("Skipping build because --skip-build was provided.");
    }

    console.log("");
    console.log("Setup complete.");
    console.log("Next useful commands:");
    console.log("- pnpm chat:cli");
    console.log("- pnpm scheduler -- --once");
    console.log("- pnpm dev");
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
