import path from "node:path";

export const APP_NAME = "SmartClaw";
export const ROOT_DIR = process.cwd();
export const DESKTOP_DIR = path.join(ROOT_DIR, "desktop");
export const MEMORY_FILE_PATH = path.join(DESKTOP_DIR, "memory.md");
export const SCHEDULE_FILE_PATH = path.join(DESKTOP_DIR, "schedule.json");
export const DATA_DIR = path.join(ROOT_DIR, "agent-data");
export const CONVERSATIONS_DIR = path.join(DATA_DIR, "conversations");
export const DEFAULT_MODEL = process.env.SMARTCLAW_MODEL ?? "moonshotai/kimi-k2.5";
export const MAX_CONTEXT_MESSAGES = 30;
export const MAX_MEMORY_SECTION_BULLETS = 18;
export const MAX_COMMAND_OUTPUT_CHARS = 12_000;
export const MAX_FILE_READ_CHARS = 30_000;
export const MAX_AI_RETRIES = 3;
