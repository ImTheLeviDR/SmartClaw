import "@/cli/load-env";

import { runDueScheduledTasks } from "@/lib/scheduler";

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function getIntervalMs(): number {
  const value = process.argv.find((arg) => arg.startsWith("--interval-ms="));
  if (!value) {
    return 60_000;
  }

  const parsed = Number(value.split("=")[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60_000;
}

async function runOnce() {
  const results = await runDueScheduledTasks();
  console.log(JSON.stringify({ ran: results.length, results }, null, 2));
}

async function main() {
  if (hasFlag("--once") || !hasFlag("--daemon")) {
    await runOnce();
    return;
  }

  const intervalMs = getIntervalMs();
  console.log(`SmartClaw scheduler daemon started. Polling every ${intervalMs}ms.`);

  while (true) {
    await runOnce();
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
