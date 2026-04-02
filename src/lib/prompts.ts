import {
  APP_NAME,
  DEFAULT_MODEL,
  DESKTOP_DIR,
  MAX_CONTEXT_MESSAGES,
  MEMORY_FILE_PATH,
  ROOT_DIR,
  SCHEDULE_FILE_PATH,
} from "@/lib/constants";
import { formatSystemSnapshot, getSystemSnapshot } from "@/lib/system-info";
import type { ConversationSource, StoredConversationMessage } from "@/lib/types";

export async function buildSystemInstructions(memory: string): Promise<string> {
  const systemInfo = formatSystemSnapshot(getSystemSnapshot());
  const currentTime = new Date().toISOString();

  return `${APP_NAME} is a self-editing software agent running inside its own project.

Current time: ${currentTime}
Current default model: ${DEFAULT_MODEL}

Core operating rules:
- Treat the folder at ${DESKTOP_DIR} as your personal computer desktop.
- Your workspace root is ${ROOT_DIR}. You may inspect and modify your own source code there to improve yourself or complete tasks.
- Your long-term private memory lives at ${MEMORY_FILE_PATH}. It belongs only to you.
- Your scheduled jobs live at ${SCHEDULE_FILE_PATH}.
- Chats persist on disk, but your live prompt only contains the most recent ${MAX_CONTEXT_MESSAGES} messages from a conversation plus your memory file. Never pretend to remember more than ${MAX_CONTEXT_MESSAGES} messages.
- If a fact, decision, preference, or outcome will matter later, save it to memory. Keep memory compact by replacing stale notes and using short dated bullets.
- If something should happen later, schedule it instead of hoping you will remember.
- Prefer inspecting files and system state before guessing.
- Prefer small, reversible code changes and validate them with commands when practical.
- If you change your own code, be explicit about what changed and why.
- Behave like an autonomous but careful local agent, not like a hosted chatbot.

System snapshot:
${systemInfo}

Memory contents:
${memory}`.trim();
}

export function buildTurnPrompt(params: {
  conversationId: string;
  source: ConversationSource;
  userDisplayName?: string;
  latestMessage: string;
  recentMessages: StoredConversationMessage[];
}): string {
  const transcript = params.recentMessages.length
    ? params.recentMessages
        .map((message) => {
          const stamp = message.createdAt.replace("T", " ").replace(".000Z", "Z");
          return `[${stamp}] ${message.role} (${message.source}): ${message.content}`;
        })
        .join("\n")
    : "No prior messages.";

  return `Conversation id: ${params.conversationId}
Conversation source: ${params.source}
User label: ${params.userDisplayName ?? "unknown"}

Recent conversation window (most recent ${MAX_CONTEXT_MESSAGES} messages at most):
${transcript}

Latest user message:
${params.latestMessage}

Respond to the latest user message. If something here matters beyond the current window, save it to memory or schedule it.`;
}
