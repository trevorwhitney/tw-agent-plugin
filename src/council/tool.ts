import type { PluginInput } from "@opencode-ai/plugin";
import type { TextPart } from "@opencode-ai/sdk";
import type { CouncilConfig, CouncilResult } from "./types.js";

type OpencodeClient = PluginInput["client"];

export async function runCouncil(
  client: OpencodeClient,
  parentSessionID: string,
  question: string,
  config: CouncilConfig,
): Promise<CouncilResult> {
  // Phase 1: Fan out to all councillors in parallel
  const opinions = await Promise.all(
    config.councillors.map(async (model) => {
      const modelLabel = `${model.providerID}/${model.modelID}`;
      let sessionId: string | undefined;
      try {
        const session = await client.session.create({
          body: { parentID: parentSessionID, title: `Council: ${modelLabel}` },
        });
        sessionId = session.data!.id;

        const result = await client.session.prompt({
          path: { id: sessionId },
          body: {
            model,
            parts: [{ type: "text" as const, text: question }],
          },
          signal: AbortSignal.timeout(config.timeoutMs),
        });

        const text = result.data!.parts
          .filter((p): p is TextPart => p.type === "text")
          .map((p) => p.text)
          .join("\n");

        return { model: modelLabel, response: text };
      } catch (err) {
        const isTimeout = err instanceof DOMException && err.name === "TimeoutError";
        if (sessionId && isTimeout) {
          client.session.abort({ path: { id: sessionId } }).catch(() => {});
        }
        return {
          model: modelLabel,
          response: "",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  // Phase 2: Synthesize through the designated agent
  const validOpinions = opinions.filter((o) => o.response && !o.error);
  const failedOpinions = opinions.filter((o) => o.error);

  const synthesisPrompt = `You are synthesizing responses from ${validOpinions.length} independent models to the following question:

<question>
${question}
</question>

${validOpinions.map((o, i) => `<councillor model="${o.model}" index="${i + 1}">
${o.response}
</councillor>`).join("\n\n")}

${failedOpinions.length > 0 ? `\nNote: ${failedOpinions.length} councillor(s) failed to respond: ${failedOpinions.map((o) => `${o.model}: ${o.error}`).join(", ")}` : ""}

Synthesize these responses: review each individually, identify agreements and contradictions, resolve contradictions with reasoning, and produce a structured output with your synthesized answer, key agreements, key disagreements, and confidence level (unanimous/majority/split).`;

  let synthSessionId: string | undefined;
  try {
    const synthSession = await client.session.create({
      body: { parentID: parentSessionID, title: "Council: Synthesis" },
    });
    synthSessionId = synthSession.data!.id;

    const synthResult = await client.session.prompt({
      path: { id: synthSessionId },
      body: {
        agent: config.synthesizer,
        parts: [{ type: "text" as const, text: synthesisPrompt }],
      },
      signal: AbortSignal.timeout(config.timeoutMs * 2),
    });

    const synthesis = synthResult.data!.parts
      .filter((p): p is TextPart => p.type === "text")
      .map((p) => p.text)
      .join("\n");

    return { synthesis, opinions };
  } catch (err) {
    return {
      synthesis: `Synthesis failed: ${err instanceof Error ? err.message : String(err)}\n\nRaw opinions:\n${validOpinions.map((o) => `### ${o.model}\n${o.response}`).join("\n\n")}`,
      opinions,
    };
  }
}
