import { describe, it, expect } from "vitest";
import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk";

const run = process.env.OPENCODE_INTEGRATION ? describe : describe.skip;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function assistantTexts(msgs: any): string[] {
  return (msgs.data ?? [])
    .filter((m: any) => m.info.role === "assistant")
    .map((m: any) =>
      (m.parts ?? [])
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join(" "),
    );
}

run("promptAsync busy-session semantics", () => {
  it("queues a message that arrives during an active turn and runs it after", async () => {
    const { server } = await createOpencode();
    try {
      const remote = createOpencodeClient({ baseUrl: server.url });
      const created = await remote.session.create({ body: { title: "spike" } });
      const id = created.data!.id;

      // Start a genuinely long turn so the session is busy while we send the
      // second message. Delivery to an idle session is the trivial case; the
      // guarantee we depend on is that a message arriving mid-turn is queued,
      // not dropped and not collapsed into the running turn.
      const first = await remote.session.promptAsync({
        path: { id },
        body: {
          parts: [
            { type: "text", text: "Write a detailed 400-word essay about the history of the bicycle. Take your time." },
          ],
        },
      });
      expect(first.error).toBeUndefined();

      // Wait until the first turn is actively generating, then send the second.
      let fired = false;
      for (let i = 0; i < 30; i++) {
        await sleep(1000);
        const texts = assistantTexts(await remote.session.messages({ path: { id } }));
        if (texts.length >= 1 && texts[texts.length - 1].length > 40) {
          const second = await remote.session.promptAsync({
            path: { id },
            body: { parts: [{ type: "text", text: "Reply with exactly the single word SECOND." }] },
          });
          expect(second.error).toBeUndefined();
          fired = true;
          break;
        }
      }
      expect(fired).toBe(true);

      // Both turns should complete, in submit order. Wait for the queued reply
      // to finish streaming (the assistant message object appears before its
      // text is populated).
      let texts: string[] = [];
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        texts = assistantTexts(await remote.session.messages({ path: { id } }));
        if (texts.length >= 2 && texts[texts.length - 1].toUpperCase().includes("SECOND")) break;
        await sleep(2000);
      }

      expect(texts.length).toBeGreaterThanOrEqual(2);
      // The busy turn survived (was not interrupted) and the queued message got
      // its own later turn.
      expect(texts[0].length).toBeGreaterThan(200);
      expect(texts[texts.length - 1].toUpperCase()).toContain("SECOND");
    } finally {
      server.close();
    }
  }, 180_000);
});
