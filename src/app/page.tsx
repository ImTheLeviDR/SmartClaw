import styles from "./page.module.css";

import {
  APP_NAME,
  DEFAULT_MODEL,
  DESKTOP_DIR,
  MEMORY_FILE_PATH,
  ROOT_DIR,
  SCHEDULE_FILE_PATH,
} from "@/lib/constants";
import { ensureRuntimeState, listConversationSummaries, readScheduleDocument } from "@/lib/store";
import { getSystemSnapshot } from "@/lib/system-info";

export const runtime = "nodejs";

export default async function Home() {
  await ensureRuntimeState();

  const [system, schedule, conversations] = await Promise.all([
    Promise.resolve(getSystemSnapshot()),
    readScheduleDocument(),
    listConversationSummaries(),
  ]);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <span className={styles.eyebrow}>Self-Editing Agent Runtime</span>
          <h1>{APP_NAME}</h1>
          <p>
            A local AI agent built on the Vercel AI SDK, Chat SDK, and AI Gateway. It can read and
            modify its own source code, run shell commands, keep a bounded private memory, and
            schedule future runs from JSON.
          </p>
          <div className={styles.heroMeta}>
            <span className={styles.pill}>Model: {DEFAULT_MODEL}</span>
            <span className={styles.pill}>Platform: {system.platform}</span>
            <span className={styles.pill}>Node: {system.nodeVersion}</span>
            <span className={styles.pill}>Recent chats: {conversations.length}</span>
          </div>
        </section>

        <section className={styles.grid}>
          <article className={styles.card}>
            <h2>CLI</h2>
            <p>The CLI chat uses the same persistent runtime as the platform adapters.</p>
            <pre className={styles.codeBlock}>pnpm chat:cli</pre>
            <ul className={styles.bullets}>
              <li>
                Conversation id: <code>cli:default</code>
              </li>
              <li>
                Special commands: <code>/memory</code>, <code>/schedule</code>, <code>/exit</code>
              </li>
              <li>AI requests retry up to 3 times on failure</li>
            </ul>
          </article>

          <article className={styles.card}>
            <h2>Desktop Memory</h2>
            <ul className={styles.monoList}>
              <li>{DESKTOP_DIR}</li>
              <li>{MEMORY_FILE_PATH}</li>
              <li>{SCHEDULE_FILE_PATH}</li>
            </ul>
            <p>
              The agent treats <code>desktop/</code> as its computer desktop. It only carries the
              last 30 chat messages into each run, so anything important should be saved into
              <code>memory.md</code>.
            </p>
          </article>

          <article className={styles.card}>
            <h2>Chat SDK Webhooks</h2>
            <ul className={styles.bullets}>
              <li>
                <code>/api/webhooks/slack</code>
              </li>
              <li>
                <code>/api/webhooks/telegram</code>
              </li>
              <li>
                <code>/api/webhooks/discord</code>
              </li>
              <li>
                <code>/api/webhooks/github</code>
              </li>
              <li>
                <code>/api/webhooks/teams</code>
              </li>
              <li>
                <code>/api/webhooks/gchat</code>
              </li>
              <li>
                <code>/api/webhooks/linear</code>
              </li>
            </ul>
            <p>Adapters are activated lazily when the matching environment variables are present.</p>
          </article>

          <article className={styles.card}>
            <h2>Scheduler</h2>
            <p>
              Scheduled tasks live in JSON and can be triggered manually or kept running in a local
              loop.
            </p>
            <pre className={styles.codeBlock}>
              pnpm scheduler -- --once{"\n"}pnpm scheduler -- --daemon
            </pre>
            <p>Currently scheduled tasks: {schedule.tasks.length}</p>
          </article>
        </section>

        <section className={styles.card}>
          <h2>Workspace Snapshot</h2>
          <ul className={styles.monoList}>
            <li>Workspace: {ROOT_DIR}</li>
            <li>
              OS: {system.platform} {system.release}
            </li>
            <li>Arch: {system.arch}</li>
            <li>CPU cores: {system.cpus}</li>
            <li>
              Memory: {system.freeMemoryGb} GB free / {system.totalMemoryGb} GB total
            </li>
            <li>Time zone: {system.timeZone}</li>
          </ul>
        </section>

        <footer className={styles.footer}>
          SmartClaw stores persistent conversations under <code>agent-data/conversations</code> and
          only rehydrates the last 30 messages of each thread into the system prompt.
        </footer>
      </div>
    </main>
  );
}
