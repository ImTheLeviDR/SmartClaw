import "@/cli/load-env";

import {
  DEFAULT_MODEL,
  DESKTOP_DIR,
  MEMORY_FILE_PATH,
  ROOT_DIR,
  SCHEDULE_FILE_PATH,
} from "@/lib/constants";
import { ensureRuntimeState } from "@/lib/store";
import { formatSystemSnapshot, getSystemSnapshot } from "@/lib/system-info";

async function main() {
  await ensureRuntimeState();
  console.log("SmartClaw bootstrap complete.");
  console.log(`Workspace: ${ROOT_DIR}`);
  console.log(`Desktop: ${DESKTOP_DIR}`);
  console.log(`Memory: ${MEMORY_FILE_PATH}`);
  console.log(`Schedule: ${SCHEDULE_FILE_PATH}`);
  console.log(`Model: ${DEFAULT_MODEL}`);
  console.log("");
  console.log(formatSystemSnapshot(getSystemSnapshot()));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
