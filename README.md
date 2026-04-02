# SmartClaw

SmartClaw is a local self-editing AI agent built with:

- [Chat SDK](https://chat-sdk.dev/) for cross-platform chat adapters
- [AI SDK](https://ai-sdk.dev/) for the agent runtime and tool calling
- [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) for model access
- Default model: `moonshotai/kimi-k2.5`

Primary target platform: Debian.
The install flow is also designed to work on other Linux distros, macOS, and Windows where Node.js, git, and pnpm or corepack are available.

## What it does

- Persists conversations on disk and keeps each thread alive over time
- Only injects the latest 30 messages into the prompt, so older context fades out
- Maintains a private `desktop/memory.md` file and injects it into the system prompt
- Treats `desktop/` as the agent's computer desktop
- Can read and modify files in its own workspace
- Can run shell commands inside the workspace
- Can schedule future runs with `desktop/schedule.json`
- Retries AI requests up to 3 times

## Folders

- `desktop/`: the agent's desktop
- `desktop/memory.md`: private long-term memory
- `desktop/schedule.json`: scheduled jobs
- `agent-data/conversations/`: persistent conversation history

## Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy `.env.example` to `.env.local`.

3. Prefer authenticating AI Gateway with Vercel OIDC:

   ```bash
   vercel link
   vercel env pull .env.local
   ```

   Or set `AI_GATEWAY_API_KEY` manually.

4. Initialize runtime files:

   ```bash
   pnpm bootstrap
   ```

## Easy install

Debian or Ubuntu one-liner:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/ImTheLeviDR/SmartClaw/main/install.sh)
```

If you still need the base tools first:

```bash
sudo apt-get update && sudo apt-get install -y git curl build-essential
```

Windows PowerShell one-liner:

```powershell
powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/ImTheLeviDR/SmartClaw/main/install.ps1 | iex"
```

If you are already inside the repo:

```bash
pnpm install
pnpm run setup:wizard
```

The installer:

- clones `https://github.com/ImTheLeviDR/SmartClaw`
- installs dependencies
- launches the guided setup wizard
- offers to pull Vercel env vars and verify the build

For unattended setup inside an already cloned repo:

```bash
pnpm run setup:wizard -- --yes --skip-vercel-pull --skip-build
```

## CLI chat

```bash
pnpm chat:cli
```

Commands:

- `/memory`
- `/schedule`
- `/exit`

## Scheduler

Run due tasks once:

```bash
pnpm scheduler -- --once
```

Run a local polling loop:

```bash
pnpm scheduler -- --daemon
```

## Chat SDK webhooks

These App Router endpoints are available when the matching env vars are configured:

- `/api/webhooks/slack`
- `/api/webhooks/telegram`
- `/api/webhooks/discord`
- `/api/webhooks/github`
- `/api/webhooks/teams`
- `/api/webhooks/gchat`
- `/api/webhooks/linear`

## Notes

- The agent only remembers what is in the last 30 messages plus `memory.md`.
- Important durable information should be written into memory.
- The source code and command tools are intentionally powerful because the agent is designed to improve itself.
- Debian is the primary target platform for deployment and day-to-day use.
- On this Windows/Turbopack build, the Discord adapter is left out of the compiled bot bundle because its dependency chain requires an extra native module path. The route exists, but it will return `503` until that adapter is re-enabled.
