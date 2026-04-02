import { handleBotWebhook } from "@/lib/bot";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleBotWebhook("slack", request);
}
