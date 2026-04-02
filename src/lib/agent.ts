import { ToolLoopAgent, stepCountIs } from "ai";

import { DEFAULT_MODEL, MAX_AI_RETRIES } from "@/lib/constants";
import { buildSystemInstructions, buildTurnPrompt } from "@/lib/prompts";
import {
  appendConversationMessage,
  ensureRuntimeState,
  getConversationWindow,
  readMemoryFile,
} from "@/lib/store";
import { createAgentTools } from "@/lib/tools";
import type { ConversationSource } from "@/lib/types";

export async function runAgentTurn(params: {
  conversationId: string;
  source: ConversationSource;
  userMessage: string;
  userDisplayName?: string;
  userId?: string;
}): Promise<{
  text: string;
  conversationId: string;
}> {
  await ensureRuntimeState();

  await appendConversationMessage({
    conversationId: params.conversationId,
    role: "user",
    content: params.userMessage,
    source: params.source,
    meta: {
      userId: params.userId,
      userDisplayName: params.userDisplayName,
    },
  });

  const [memory, recentMessages] = await Promise.all([
    readMemoryFile(),
    getConversationWindow(params.conversationId),
  ]);

  const agent = new ToolLoopAgent({
    model: DEFAULT_MODEL,
    instructions: await buildSystemInstructions(memory),
    tools: createAgentTools(params.source, params.conversationId),
    stopWhen: stepCountIs(12),
    maxRetries: MAX_AI_RETRIES,
    providerOptions: {
      gateway: {
        user: params.userId ?? params.conversationId,
        tags: [`source:${params.source}`, "app:smartclaw", `conversation:${params.conversationId}`],
      },
    },
  });

  const result = await agent.generate({
    prompt: buildTurnPrompt({
      conversationId: params.conversationId,
      source: params.source,
      userDisplayName: params.userDisplayName,
      latestMessage: params.userMessage,
      recentMessages,
    }),
  });

  const text = result.text.trim() || "I completed the run but did not produce a text reply.";

  await appendConversationMessage({
    conversationId: params.conversationId,
    role: "assistant",
    content: text,
    source: params.source,
    meta: {
      finishReason: result.finishReason,
      usage: result.usage,
      model: DEFAULT_MODEL,
    },
  });

  return {
    text,
    conversationId: params.conversationId,
  };
}
