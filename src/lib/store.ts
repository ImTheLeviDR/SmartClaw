import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import cronParser from "cron-parser";

import {
  CONVERSATIONS_DIR,
  DATA_DIR,
  DESKTOP_DIR,
  MAX_CONTEXT_MESSAGES,
  MAX_MEMORY_SECTION_BULLETS,
  MEMORY_FILE_PATH,
  ROOT_DIR,
  SCHEDULE_FILE_PATH,
} from "@/lib/constants";
import type {
  ConversationRole,
  ScheduleDefinition,
  ScheduleDocument,
  ScheduledTask,
  StoredConversation,
  StoredConversationMessage,
} from "@/lib/types";

const DEFAULT_MEMORY = `# SmartClaw Memory

This file is SmartClaw's private long-term memory.

Guidelines:
- Save durable facts, active priorities, decisions, and important outcomes.
- Use short dated bullets.
- Replace stale notes instead of endlessly appending.
- Keep this file compact and easy to scan.

## Identity
- 2026-04-02: SmartClaw is a self-editing AI agent that treats this \`desktop/\` folder as its computer desktop.

## Active Projects
- 2026-04-02: Build the SmartClaw agent system with Chat SDK, AI SDK, AI Gateway, CLI chat, memory, and scheduling.

## Important Facts
- 2026-04-02: Chats persist on disk, but the live prompt only includes the most recent 30 messages plus this memory file.

## Timeline
- 2026-04-02: Memory file initialized.

## Open Loops
- 2026-04-02: Configure AI Gateway credentials and any chat platform tokens before using live model calls or webhooks.
`;

const DEFAULT_SCHEDULE: ScheduleDocument = {
  version: 1,
  updatedAt: "2026-04-02T00:00:00.000Z",
  tasks: [],
};

function sanitizeConversationId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getConversationFilePath(id: string): string {
  return path.join(CONVERSATIONS_DIR, `${sanitizeConversationId(id)}.json`);
}

function nowIso(): string {
  return new Date().toISOString();
}

async function ensureFile(filePath: string, defaultContents: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, defaultContents, "utf8");
  }
}

export async function ensureRuntimeState(): Promise<void> {
  await fs.mkdir(ROOT_DIR, { recursive: true });
  await fs.mkdir(DESKTOP_DIR, { recursive: true });
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(CONVERSATIONS_DIR, { recursive: true });
  await ensureFile(path.join(DESKTOP_DIR, "README.md"), "# SmartClaw Desktop\n");
  await ensureFile(MEMORY_FILE_PATH, DEFAULT_MEMORY);
  await ensureFile(
    SCHEDULE_FILE_PATH,
    JSON.stringify(DEFAULT_SCHEDULE, null, 2) + "\n",
  );
}

export async function readMemoryFile(): Promise<string> {
  await ensureRuntimeState();
  return fs.readFile(MEMORY_FILE_PATH, "utf8");
}

export async function writeMemoryFile(contents: string): Promise<void> {
  await ensureRuntimeState();
  await fs.writeFile(MEMORY_FILE_PATH, contents.trimEnd() + "\n", "utf8");
}

function splitMemorySections(memory: string): Record<string, string[]> {
  const lines = memory.split(/\r?\n/);
  const sections: Record<string, string[]> = {};
  let current = "root";
  sections[current] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      current = line.slice(3).trim();
      sections[current] = sections[current] ?? [];
      continue;
    }

    sections[current] = sections[current] ?? [];
    sections[current].push(line);
  }

  return sections;
}

function trimBulletSection(lines: string[]): string[] {
  const bullets = lines.filter((line) => line.trimStart().startsWith("- "));
  const nonBullets = lines.filter((line) => !line.trimStart().startsWith("- "));

  if (bullets.length <= MAX_MEMORY_SECTION_BULLETS) {
    return [...nonBullets, ...bullets];
  }

  return [...nonBullets, ...bullets.slice(-MAX_MEMORY_SECTION_BULLETS)];
}

function joinMemorySections(sections: Record<string, string[]>): string {
  const order = ["root", "Identity", "Active Projects", "Important Facts", "Timeline", "Open Loops"];
  const seen = new Set<string>();
  const chunks: string[] = [];

  for (const name of [...order, ...Object.keys(sections)]) {
    if (seen.has(name) || !sections[name]) {
      continue;
    }

    seen.add(name);

    if (name === "root") {
      chunks.push(sections[name].join("\n").trimEnd());
      continue;
    }

    chunks.push(`## ${name}\n${trimBulletSection(sections[name]).join("\n").trimEnd()}`.trimEnd());
  }

  return chunks.filter(Boolean).join("\n\n").trimEnd() + "\n";
}

export async function saveMemoryNote(section: string, note: string): Promise<string> {
  const memory = await readMemoryFile();
  const sections = splitMemorySections(memory);
  const sectionName = section
    .split(/[_-]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  const datedNote = `- ${new Date().toISOString().slice(0, 10)}: ${note.trim()}`;

  sections[sectionName] = sections[sectionName] ?? [];

  if (!sections[sectionName].some((line) => line.trim() === datedNote.trim())) {
    sections[sectionName].push(datedNote);
  }

  const updated = joinMemorySections(sections);
  await writeMemoryFile(updated);
  return updated;
}

export async function loadConversation(id: string): Promise<StoredConversation> {
  await ensureRuntimeState();
  const filePath = getConversationFilePath(id);

  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as StoredConversation;
  } catch {
    const now = nowIso();
    const conversation: StoredConversation = {
      id,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };

    await fs.writeFile(filePath, JSON.stringify(conversation, null, 2) + "\n", "utf8");
    return conversation;
  }
}

export async function saveConversation(conversation: StoredConversation): Promise<void> {
  await ensureRuntimeState();
  const filePath = getConversationFilePath(conversation.id);
  await fs.writeFile(filePath, JSON.stringify(conversation, null, 2) + "\n", "utf8");
}

export async function appendConversationMessage(params: {
  conversationId: string;
  role: ConversationRole;
  content: string;
  source: StoredConversationMessage["source"];
  meta?: Record<string, unknown>;
}): Promise<StoredConversation> {
  const conversation = await loadConversation(params.conversationId);
  const now = nowIso();

  conversation.messages.push({
    id: randomUUID(),
    role: params.role,
    content: params.content,
    createdAt: now,
    source: params.source,
    meta: params.meta,
  });
  conversation.updatedAt = now;

  await saveConversation(conversation);
  return conversation;
}

export async function getConversationWindow(
  conversationId: string,
  maxMessages = MAX_CONTEXT_MESSAGES,
): Promise<StoredConversationMessage[]> {
  const conversation = await loadConversation(conversationId);
  return conversation.messages.slice(-maxMessages);
}

export async function readScheduleDocument(): Promise<ScheduleDocument> {
  await ensureRuntimeState();

  try {
    const raw = await fs.readFile(SCHEDULE_FILE_PATH, "utf8");
    return JSON.parse(raw) as ScheduleDocument;
  } catch {
    await fs.writeFile(
      SCHEDULE_FILE_PATH,
      JSON.stringify(DEFAULT_SCHEDULE, null, 2) + "\n",
      "utf8",
    );
    return DEFAULT_SCHEDULE;
  }
}

export async function writeScheduleDocument(document: ScheduleDocument): Promise<void> {
  await ensureRuntimeState();
  document.updatedAt = nowIso();
  await fs.writeFile(SCHEDULE_FILE_PATH, JSON.stringify(document, null, 2) + "\n", "utf8");
}

export function computeNextRunAt(
  schedule: ScheduleDefinition,
  fromDate = new Date(),
  previousRunAt?: string,
): string | null {
  if (schedule.type === "once") {
    if (previousRunAt) {
      return null;
    }
    return schedule.runAt;
  }

  if (schedule.type === "interval") {
    const baseline = previousRunAt
      ? new Date(previousRunAt)
      : schedule.startAt
        ? new Date(schedule.startAt)
        : fromDate;

    return new Date(baseline.getTime() + schedule.everyMinutes * 60_000).toISOString();
  }

  const expression = cronParser.parse(schedule.cron, {
    currentDate: fromDate,
    tz: schedule.timezone,
  });
  return expression.next().toISOString();
}

export async function upsertScheduledTask(input: {
  id?: string;
  title: string;
  prompt: string;
  schedule: ScheduleDefinition;
  enabled?: boolean;
  conversationId?: string;
}): Promise<ScheduledTask> {
  const document = await readScheduleDocument();
  const now = nowIso();
  const taskId =
    input.id ??
    `${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "task"}-${randomUUID().slice(0, 8)}`;
  const existingIndex = document.tasks.findIndex((task) => task.id === taskId);
  const existing = existingIndex >= 0 ? document.tasks[existingIndex] : undefined;

  const task: ScheduledTask = {
    id: taskId,
    title: input.title,
    prompt: input.prompt,
    conversationId: input.conversationId ?? existing?.conversationId ?? `schedule:${taskId}`,
    enabled: input.enabled ?? existing?.enabled ?? true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastRunAt: existing?.lastRunAt,
    lastRunStatus: existing?.lastRunStatus,
    lastRunSummary: existing?.lastRunSummary,
    lastError: existing?.lastError,
    schedule: input.schedule,
    nextRunAt: computeNextRunAt(input.schedule, new Date(), existing?.lastRunAt),
  };

  if (existingIndex >= 0) {
    document.tasks[existingIndex] = task;
  } else {
    document.tasks.push(task);
  }

  await writeScheduleDocument(document);
  return task;
}

export async function updateScheduledTask(task: ScheduledTask): Promise<void> {
  const document = await readScheduleDocument();
  const index = document.tasks.findIndex((entry) => entry.id === task.id);

  if (index === -1) {
    document.tasks.push(task);
  } else {
    document.tasks[index] = task;
  }

  await writeScheduleDocument(document);
}

export async function getDueTasks(referenceDate = new Date()): Promise<ScheduledTask[]> {
  const document = await readScheduleDocument();
  return document.tasks.filter((task) => {
    if (!task.enabled || !task.nextRunAt) {
      return false;
    }

    return new Date(task.nextRunAt).getTime() <= referenceDate.getTime();
  });
}

export async function listConversationSummaries(): Promise<Array<{ id: string; updatedAt: string; messageCount: number }>> {
  await ensureRuntimeState();
  const entries = await fs.readdir(CONVERSATIONS_DIR, { withFileTypes: true });
  const summaries: Array<{ id: string; updatedAt: string; messageCount: number }> = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    try {
      const raw = await fs.readFile(path.join(CONVERSATIONS_DIR, entry.name), "utf8");
      const conversation = JSON.parse(raw) as StoredConversation;
      summaries.push({
        id: conversation.id,
        updatedAt: conversation.updatedAt,
        messageCount: conversation.messages.length,
      });
    } catch {
      continue;
    }
  }

  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
