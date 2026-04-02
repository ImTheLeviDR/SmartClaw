import { runDueScheduledTasks } from "@/lib/scheduler";

export const runtime = "nodejs";

export async function POST() {
  const results = await runDueScheduledTasks();
  return Response.json({
    ran: results.length,
    results,
  });
}
