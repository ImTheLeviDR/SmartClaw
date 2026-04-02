export type ConversationRole = "user" | "assistant";

export type ConversationSource =
  | "cli"
  | "scheduler"
  | "slack"
  | "telegram"
  | "discord"
  | "github"
  | "teams"
  | "gchat"
  | "linear"
  | "api"
  | "unknown";

export interface StoredConversationMessage {
  id: string;
  role: ConversationRole;
  content: string;
  createdAt: string;
  source: ConversationSource;
  meta?: Record<string, unknown>;
}

export interface StoredConversation {
  id: string;
  createdAt: string;
  updatedAt: string;
  messages: StoredConversationMessage[];
}

export type ScheduleDefinition =
  | {
      type: "once";
      runAt: string;
    }
  | {
      type: "interval";
      everyMinutes: number;
      startAt?: string;
    }
  | {
      type: "cron";
      cron: string;
      timezone?: string;
    };

export interface ScheduledTask {
  id: string;
  title: string;
  prompt: string;
  conversationId: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastRunStatus?: "success" | "error";
  lastRunSummary?: string;
  lastError?: string;
  nextRunAt?: string | null;
  schedule: ScheduleDefinition;
}

export interface ScheduleDocument {
  version: number;
  updatedAt: string;
  tasks: ScheduledTask[];
}
