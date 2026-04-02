import "dotenv/config";

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { runAgentTurn } from "@/lib/agent";
import { readMemoryFile, readScheduleDocument } from "@/lib/store";

async function main() {
  const rl = createInterface({ input, output });
  const conversationId = "cli:default";

  console.log("SmartClaw CLI");
  console.log("Type /exit to quit, /memory to view memory, /schedule to view the schedule.");
  console.log("");

  while (true) {
    const message = (await rl.question("> ")).trim();

    if (!message) {
      continue;
    }

    if (message === "/exit" || message === "/quit") {
      break;
    }

    if (message === "/memory") {
      console.log("");
      console.log(await readMemoryFile());
      continue;
    }

    if (message === "/schedule") {
      console.log("");
      console.log(JSON.stringify(await readScheduleDocument(), null, 2));
      continue;
    }

    console.log("");

    try {
      const result = await runAgentTurn({
        conversationId,
        source: "cli",
        userMessage: message,
        userDisplayName: "local-user",
        userId: "local-user",
      });
      console.log(result.text);
    } catch (error) {
      console.error(
        error instanceof Error ? error.message : "Unknown SmartClaw runtime error.",
      );
    }

    console.log("");
  }

  rl.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
