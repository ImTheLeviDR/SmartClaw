import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import { tool } from "ai";
import { z } from "zod";

import {
  MAX_COMMAND_OUTPUT_CHARS,
  MAX_FILE_READ_CHARS,
  ROOT_DIR,
} from "@/lib/constants";
import { getSystemSnapshot } from "@/lib/system-info";
import { ensureRuntimeState, readScheduleDocument, saveMemoryNote, upsertScheduledTask } from "@/lib/store";
import type { ConversationSource, ScheduleDefinition } from "@/lib/types";

function ensureInsideRoot(resolvedPath: string): void {
  const root = ROOT_DIR.toLowerCase();
  const target = resolvedPath.toLowerCase();
  const normalizedRoot = root.endsWith(path.sep) ? root : `${root}${path.sep}`;

  if (target !== root && !target.startsWith(normalizedRoot)) {
    throw new Error(`Path must stay inside the workspace root: ${ROOT_DIR}`);
  }
}

function resolveWorkspacePath(requestedPath: string): string {
  const candidate = requestedPath.trim() === "" ? "." : requestedPath;
  const resolvedPath = path.resolve(ROOT_DIR, candidate);
  ensureInsideRoot(resolvedPath);
  return resolvedPath;
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit)}\n\n...[truncated ${value.length - limit} chars]`;
}

async function listFilesRecursive(
  basePath: string,
  maxDepth: number,
  currentDepth = 0,
): Promise<string[]> {
  if (currentDepth > maxDepth) {
    return [];
  }

  const entries = await fs.readdir(basePath, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if ([".git", ".next", "node_modules", "agent-data"].includes(entry.name)) {
      continue;
    }

    const fullPath = path.join(basePath, entry.name);
    const relativePath = path.relative(ROOT_DIR, fullPath) || ".";
    results.push(entry.isDirectory() ? `${relativePath}/` : relativePath);

    if (entry.isDirectory()) {
      results.push(...(await listFilesRecursive(fullPath, maxDepth, currentDepth + 1)));
    }
  }

  return results;
}

async function searchFiles(query: string, relativeDir: string): Promise<string> {
  const startPath = resolveWorkspacePath(relativeDir);
  const entries = await listFilesRecursive(startPath, 8);
  const hits: string[] = [];

  for (const relative of entries) {
    if (relative.endsWith("/")) {
      continue;
    }

    const filePath = resolveWorkspacePath(relative);

    try {
      const stat = await fs.stat(filePath);
      if (stat.size > 250_000) {
        continue;
      }

      const content = await fs.readFile(filePath, "utf8");
      const lines = content.split(/\r?\n/);

      lines.forEach((line, index) => {
        if (line.toLowerCase().includes(query.toLowerCase())) {
          hits.push(`${relative}:${index + 1}: ${line.trim()}`);
        }
      });
    } catch {
      continue;
    }

    if (hits.length >= 60) {
      break;
    }
  }

  return hits.length > 0 ? hits.join("\n") : "No matches found.";
}

async function runCommand(command: string, cwd?: string): Promise<{
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}> {
  const workingDirectory = cwd ? resolveWorkspacePath(cwd) : ROOT_DIR;
  await ensureRuntimeState();

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "powershell.exe" : "bash",
      process.platform === "win32"
        ? ["-NoLogo", "-NoProfile", "-Command", command]
        : ["-lc", command],
      {
        cwd: workingDirectory,
        env: process.env,
        windowsHide: true,
      },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({
        cwd: workingDirectory,
        exitCode,
        stdout: truncate(stdout, MAX_COMMAND_OUTPUT_CHARS),
        stderr: truncate(stderr, MAX_COMMAND_OUTPUT_CHARS),
      });
    });
  });
}

const scheduleSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("once"),
    runAt: z.string().datetime(),
  }),
  z.object({
    type: z.literal("interval"),
    everyMinutes: z.number().int().positive(),
    startAt: z.string().datetime().optional(),
  }),
  z.object({
    type: z.literal("cron"),
    cron: z.string().min(5),
    timezone: z.string().optional(),
  }),
]) satisfies z.ZodType<ScheduleDefinition>;

export function createAgentTools(source: ConversationSource, conversationId: string) {
  return {
    list_files: tool({
      description: "List files and folders under a workspace path.",
      inputSchema: z.object({
        path: z.string().default("."),
        maxDepth: z.number().int().min(0).max(8).default(3),
      }),
      strict: true,
      execute: async ({ path: requestedPath, maxDepth }) => {
        const targetPath = resolveWorkspacePath(requestedPath);
        const files = await listFilesRecursive(targetPath, maxDepth);
        return {
          path: path.relative(ROOT_DIR, targetPath) || ".",
          entries: files,
        };
      },
    }),
    read_file: tool({
      description: "Read a UTF-8 text file from the workspace, optionally by line range.",
      inputSchema: z.object({
        path: z.string().min(1),
        startLine: z.number().int().positive().optional(),
        endLine: z.number().int().positive().optional(),
      }),
      strict: true,
      execute: async ({ path: requestedPath, startLine, endLine }) => {
        const filePath = resolveWorkspacePath(requestedPath);
        const raw = await fs.readFile(filePath, "utf8");
        const lines = raw.split(/\r?\n/);
        const start = startLine ? startLine - 1 : 0;
        const end = endLine ? Math.min(endLine, lines.length) : lines.length;
        const sliced = lines.slice(start, end).join("\n");

        return {
          path: path.relative(ROOT_DIR, filePath),
          content: truncate(sliced, MAX_FILE_READ_CHARS),
        };
      },
    }),
    write_file: tool({
      description: "Write a UTF-8 text file inside the workspace, creating parent folders when needed.",
      inputSchema: z.object({
        path: z.string().min(1),
        content: z.string(),
      }),
      strict: true,
      execute: async ({ path: requestedPath, content }) => {
        const filePath = resolveWorkspacePath(requestedPath);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, "utf8");
        return {
          path: path.relative(ROOT_DIR, filePath),
          bytesWritten: Buffer.byteLength(content, "utf8"),
        };
      },
    }),
    replace_in_file: tool({
      description: "Replace a literal string inside a UTF-8 text file.",
      inputSchema: z.object({
        path: z.string().min(1),
        find: z.string().min(1),
        replaceWith: z.string(),
        replaceAll: z.boolean().default(false),
      }),
      strict: true,
      execute: async ({ path: requestedPath, find, replaceWith, replaceAll }) => {
        const filePath = resolveWorkspacePath(requestedPath);
        const original = await fs.readFile(filePath, "utf8");

        if (!original.includes(find)) {
          throw new Error(`Could not find the target string in ${requestedPath}`);
        }

        const updated = replaceAll
          ? original.split(find).join(replaceWith)
          : original.replace(find, replaceWith);
        await fs.writeFile(filePath, updated, "utf8");

        return {
          path: path.relative(ROOT_DIR, filePath),
          replaced: replaceAll ? original.split(find).length - 1 : 1,
        };
      },
    }),
    search_files: tool({
      description: "Search text files in the workspace for a case-insensitive query.",
      inputSchema: z.object({
        query: z.string().min(1),
        path: z.string().default("."),
      }),
      strict: true,
      execute: async ({ query, path: requestedPath }) => {
        const matches = await searchFiles(query, requestedPath);
        return {
          query,
          matches,
        };
      },
    }),
    run_command: tool({
      description: "Run a shell command in the workspace and capture stdout and stderr.",
      inputSchema: z.object({
        command: z.string().min(1),
        cwd: z.string().optional(),
      }),
      strict: true,
      execute: async ({ command, cwd }) => runCommand(command, cwd),
    }),
    get_system_info: tool({
      description: "Get the current operating-system and workspace information for this agent.",
      inputSchema: z.object({}),
      strict: true,
      execute: async () => getSystemSnapshot(),
    }),
    save_memory: tool({
      description: "Save an important long-term note into the agent's private memory file.",
      inputSchema: z.object({
        section: z.enum(["identity", "active_projects", "important_facts", "timeline", "open_loops"]),
        note: z.string().min(1),
      }),
      strict: true,
      execute: async ({ section, note }) => {
        const updated = await saveMemoryNote(section, note);
        return {
          saved: true,
          section,
          preview: truncate(updated, 4_000),
        };
      },
    }),
    view_schedule: tool({
      description: "Read the current JSON schedule file.",
      inputSchema: z.object({}),
      strict: true,
      execute: async () => readScheduleDocument(),
    }),
    schedule_run: tool({
      description: "Create or update a scheduled task that this agent should run later.",
      inputSchema: z.object({
        id: z.string().optional(),
        title: z.string().min(1),
        prompt: z.string().min(1),
        enabled: z.boolean().default(true),
        schedule: scheduleSchema,
      }),
      strict: true,
      execute: async ({ id, title, prompt, enabled, schedule }) => {
        const task = await upsertScheduledTask({
          id,
          title,
          prompt,
          enabled,
          schedule,
        });
        return task;
      },
    }),
    get_runtime_context: tool({
      description: "Return the current source and conversation identifiers for the active run.",
      inputSchema: z.object({}),
      strict: true,
      execute: async () => ({
        source,
        conversationId,
      }),
    }),
  };
}
