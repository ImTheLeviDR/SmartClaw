import { after } from "next/server";
import { Chat, type Adapter, type Message, type Thread } from "chat";
import { createGoogleChatAdapter } from "@chat-adapter/gchat";
import { createGitHubAdapter } from "@chat-adapter/github";
import { createLinearAdapter } from "@chat-adapter/linear";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createMemoryState } from "@chat-adapter/state-memory";
import { createTeamsAdapter } from "@chat-adapter/teams";
import { createTelegramAdapter } from "@chat-adapter/telegram";

import { runAgentTurn } from "@/lib/agent";
import type { ConversationSource } from "@/lib/types";

let botSingleton: Chat<Record<string, Adapter>> | null = null;

function detectPlatform(raw: unknown): ConversationSource {
  if (!raw || typeof raw !== "object") {
    return "unknown";
  }

  const value = raw as Record<string, unknown>;

  if ("team_id" in value || "channel" in value || "thread_ts" in value) {
    return "slack";
  }
  if ("update_id" in value || "message_thread_id" in value) {
    return "telegram";
  }
  if ("guild_id" in value || "application_id" in value) {
    return "discord";
  }
  if ("installation" in value || "repository" in value) {
    return "github";
  }
  if ("channelData" in value || "conversation" in value) {
    return "teams";
  }
  if ("space" in value || "cardsV2" in value) {
    return "gchat";
  }
  if ("organizationId" in value || "issue" in value) {
    return "linear";
  }

  return "unknown";
}

function detectUserDisplayName(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const value = raw as Record<string, unknown>;
  const possible =
    value.user_name ??
    value.username ??
    value.displayName ??
    value.name ??
    value.sender ??
    value.actor;

  return typeof possible === "string" ? possible : undefined;
}

function detectUserId(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const value = raw as Record<string, unknown>;
  const direct = value.user ?? value.userId ?? value.senderId ?? value.actor_id;

  if (typeof direct === "string" || typeof direct === "number") {
    return String(direct);
  }

  if (direct && typeof direct === "object" && "id" in direct) {
    const nested = (direct as { id?: unknown }).id;
    if (typeof nested === "string" || typeof nested === "number") {
      return String(nested);
    }
  }

  return undefined;
}

function splitReply(text: string, chunkSize = 3200): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > chunkSize) {
    let index = remaining.lastIndexOf("\n", chunkSize);
    if (index < chunkSize * 0.5) {
      index = remaining.lastIndexOf(" ", chunkSize);
    }
    if (index < chunkSize * 0.5) {
      index = chunkSize;
    }

    chunks.push(remaining.slice(0, index).trim());
    remaining = remaining.slice(index).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks.length > 0 ? chunks : ["I completed the task but do not have a text reply to send."];
}

async function postReply(thread: Thread, text: string): Promise<void> {
  for (const chunk of splitReply(text)) {
    await thread.post(chunk);
  }
}

async function handleIncomingMessage(thread: Thread, message: Message): Promise<void> {
  const source = detectPlatform(message.raw);
  const conversationId = `${source}:${thread.id}`;
  const userMessage = message.text.trim();

  if (!userMessage) {
    return;
  }

  try {
    await thread.subscribe();
  } catch {
    // Some platforms do not require or support subscribe transitions here.
  }

  try {
    await thread.startTyping();
  } catch {
    // Typing indicators are adapter-specific.
  }

  try {
    const result = await runAgentTurn({
      conversationId,
      source,
      userMessage,
      userDisplayName: detectUserDisplayName(message.raw),
      userId: detectUserId(message.raw),
    });

    await postReply(thread, result.text);
  } catch (error) {
    const messageText =
      error instanceof Error ? error.message : "Unknown agent error.";
    await postReply(
      thread,
      `SmartClaw could not finish that run.\n\n${messageText}`,
    );
  }
}

function buildConfiguredAdapters(): Record<string, Adapter> {
  const adapters: Record<string, Adapter> = {};

  if (
    process.env.SLACK_SIGNING_SECRET &&
    (process.env.SLACK_BOT_TOKEN ||
      (process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET))
  ) {
    adapters.slack = createSlackAdapter({
      signingSecret: process.env.SLACK_SIGNING_SECRET,
      botToken: process.env.SLACK_BOT_TOKEN,
      botUserId: process.env.SLACK_BOT_USER_ID,
      clientId: process.env.SLACK_CLIENT_ID,
      clientSecret: process.env.SLACK_CLIENT_SECRET,
      encryptionKey: process.env.SLACK_ENCRYPTION_KEY,
      userName: "smartclaw",
    });
  }

  if (process.env.TELEGRAM_BOT_TOKEN) {
    adapters.telegram = createTelegramAdapter({
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      secretToken: process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN,
      userName: process.env.TELEGRAM_BOT_USERNAME ?? "smartclaw",
      mode: "webhook",
    });
  }

  if (
    process.env.DISCORD_BOT_TOKEN &&
    process.env.DISCORD_PUBLIC_KEY &&
    process.env.DISCORD_APPLICATION_ID
  ) {
    // Discord is intentionally skipped in the compiled bot bundle on this setup.
  }

  if (
    process.env.GITHUB_WEBHOOK_SECRET &&
    (process.env.GITHUB_TOKEN ||
      (process.env.GITHUB_APP_ID &&
        process.env.GITHUB_PRIVATE_KEY &&
        process.env.GITHUB_INSTALLATION_ID))
  ) {
    adapters.github = createGitHubAdapter({
      botUserId: process.env.GITHUB_BOT_USER_ID
        ? Number(process.env.GITHUB_BOT_USER_ID)
        : undefined,
    });
  }

  if (
    process.env.TEAMS_APP_ID &&
    process.env.TEAMS_APP_PASSWORD &&
    process.env.TEAMS_APP_TENANT_ID
  ) {
    adapters.teams = createTeamsAdapter({
      appType: "SingleTenant",
      userName: "smartclaw",
    });
  }

  if (process.env.GOOGLE_CHAT_CREDENTIALS || process.env.GOOGLE_CHAT_USE_ADC) {
    adapters.gchat = createGoogleChatAdapter();
  }

  if (
    process.env.LINEAR_ACCESS_TOKEN ||
    (process.env.LINEAR_CLIENT_ID && process.env.LINEAR_CLIENT_SECRET)
  ) {
    adapters.linear = process.env.LINEAR_ACCESS_TOKEN
      ? createLinearAdapter({
          accessToken: process.env.LINEAR_ACCESS_TOKEN,
        })
      : createLinearAdapter({
          clientId: process.env.LINEAR_CLIENT_ID!,
          clientSecret: process.env.LINEAR_CLIENT_SECRET!,
        });
  }

  return adapters;
}

export function getBot(): Chat<Record<string, Adapter>> {
  if (botSingleton) {
    return botSingleton;
  }

  const bot = new Chat({
    userName: "smartclaw",
    adapters: buildConfiguredAdapters(),
    state: createMemoryState(),
    fallbackStreamingPlaceholderText: "SmartClaw is thinking...",
  });

  bot.onDirectMessage(handleIncomingMessage);
  bot.onNewMention(handleIncomingMessage);
  bot.onSubscribedMessage(handleIncomingMessage);

  botSingleton = bot;
  return botSingleton;
}

type GenericWebhookHandler = (
  request: Request,
  options?: { waitUntil?: (promise: Promise<unknown>) => void },
) => Promise<Response>;

export async function handleBotWebhook(adapterName: string, request: Request): Promise<Response> {
  const bot = getBot();
  const webhook = (bot.webhooks as Record<string, GenericWebhookHandler | undefined>)[adapterName];

  if (!webhook) {
    return Response.json(
      {
        error: `${adapterName} adapter is not configured.`,
      },
      { status: 503 },
    );
  }

  if (adapterName === "slack") {
    return webhook(request, {
      waitUntil: (promise) => after(() => promise),
    });
  }

  return webhook(request);
}
