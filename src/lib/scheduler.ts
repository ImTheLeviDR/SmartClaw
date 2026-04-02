import { runAgentTurn } from "@/lib/agent";
import { computeNextRunAt, getDueTasks, updateScheduledTask } from "@/lib/store";

export async function runDueScheduledTasks(referenceDate = new Date()) {
  const dueTasks = await getDueTasks(referenceDate);
  const results: Array<{
    id: string;
    title: string;
    status: "success" | "error";
    nextRunAt: string | null | undefined;
  }> = [];

  for (const task of dueTasks) {
    try {
      const result = await runAgentTurn({
        conversationId: task.conversationId,
        source: "scheduler",
        userMessage: task.prompt,
        userDisplayName: task.title,
        userId: task.id,
      });

      task.lastRunAt = referenceDate.toISOString();
      task.lastRunStatus = "success";
      task.lastRunSummary = result.text.slice(0, 400);
      task.lastError = undefined;
      task.nextRunAt = computeNextRunAt(
        task.schedule,
        new Date(referenceDate.getTime() + 1000),
        task.lastRunAt,
      );
      task.updatedAt = new Date().toISOString();

      if (task.schedule.type === "once") {
        task.enabled = false;
      }

      await updateScheduledTask(task);
      results.push({
        id: task.id,
        title: task.title,
        status: "success",
        nextRunAt: task.nextRunAt,
      });
    } catch (error) {
      task.lastRunAt = referenceDate.toISOString();
      task.lastRunStatus = "error";
      task.lastError = error instanceof Error ? error.message : "Unknown scheduler error.";
      task.nextRunAt = computeNextRunAt(
        task.schedule,
        new Date(referenceDate.getTime() + 1000),
        task.lastRunAt,
      );
      task.updatedAt = new Date().toISOString();

      if (task.schedule.type === "once") {
        task.enabled = false;
      }

      await updateScheduledTask(task);
      results.push({
        id: task.id,
        title: task.title,
        status: "error",
        nextRunAt: task.nextRunAt,
      });
    }
  }

  return results;
}
