import { describe, it, expect } from "vitest";
import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { publishServer } from "./publisher.js";
import { readMirror } from "./mirror.js";
import { readServerUrl } from "./server-registry.js";
import { sendToAgent } from "./send.js";

const run = process.env.OPENCODE_INTEGRATION ? describe : describe.skip;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

run("end-to-end send", () => {
  it("publishes, resolves via mirror, and delivers via promptAsync", async () => {
    const { server } = await createOpencode();
    const stateAgents = await mkdtemp(join(tmpdir(), "e2e-agents-"));
    const stateServers = await mkdtemp(join(tmpdir(), "e2e-servers-"));
    const targetWorktree = await mkdtemp(join(tmpdir(), "e2e-wt-"));
    try {
      const remote = createOpencodeClient({ baseUrl: server.url });
      const created = await remote.session.create({ body: { title: "e2e" } });
      const id = created.data!.id;

      await publishServer(stateServers, targetWorktree, "opencode#0", new URL(server.url));
      await writeFile(
        join(stateAgents, "rec.json"),
        JSON.stringify({
          project: "p", worktree: "tgt", path: targetWorktree, handle: "tgt",
          mode: "opencode", idx: 0, status: "waiting", session_id: id,
          updated_ts: 1, schema: 1,
        }),
      );

      const records = await readMirror(stateAgents);
      const out = await sendToAgent(
        { to: "tgt", message: "reply with READY" },
        {
          selfWorktree: "/nonexistent/other/worktree",
          records,
          readServerUrl: (p, slot) => readServerUrl(stateServers, p, slot),
          makeClient: (baseUrl) => createOpencodeClient({ baseUrl }) as any,
        },
      );
      expect(out).toMatch(/delivered to tgt/i);

      const deadline = Date.now() + 120_000;
      let got = false;
      while (Date.now() < deadline) {
        const msgs = await remote.session.messages({ path: { id } });
        const userTexts = (msgs.data ?? [])
          .filter((m: any) => m.info.role === "user")
          .flatMap((m: any) => (m.parts ?? []).filter((p: any) => p.type === "text").map((p: any) => p.text));
        if (userTexts.some((t: string) => t.includes("[message from agent"))) { got = true; break; }
        await sleep(2000);
      }
      expect(got).toBe(true);
    } finally {
      server.close();
      await rm(stateAgents, { recursive: true, force: true });
      await rm(stateServers, { recursive: true, force: true });
      await rm(targetWorktree, { recursive: true, force: true });
    }
  }, 180_000);
});
