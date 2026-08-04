import { tool } from "@opencode-ai/plugin";
import { jobToken, postAgentd } from "./client.js";

export function createReportTool(): ReturnType<typeof tool> {
  return tool({
    description:
      "Deliver your final consult recommendation to agentd. Only available when " +
      "running as an agentd consult job (AGENTD_JOB_TOKEN set). Call exactly once, " +
      "then end your turn.",
    args: {
      verdict: tool.schema
        .string()
        .describe("Recommendation label, e.g. approve, request-changes, needs-human"),
      summary: tool.schema.string().describe("One-line summary of the recommendation"),
      details: tool.schema.string().describe("Full analysis in markdown"),
    },
    async execute(args) {
      const token = jobToken();
      if (!token) return "Not running under agentd (AGENTD_JOB_TOKEN unset); report not sent.";
      try {
        await postAgentd(`/jobs/${token}/report`, args);
      } catch (err) {
        return `Report not accepted: ${String(err)}. End your turn; the operator resolved the job already.`;
      }
      return "Report delivered to agentd. End your turn now.";
    },
  });
}

export function createEscalateTool(): ReturnType<typeof tool> {
  return tool({
    description:
      "Ask the human operator a question via the agentd inbox. Only available when " +
      "running as an agentd consult job. Your turn ends after asking; the operator's " +
      "answer arrives as a new message.",
    args: {
      kind: tool.schema.string().describe("Escalation kind, e.g. question"),
      question: tool.schema.string().describe("The question the operator must answer"),
      context: tool.schema.string().describe("Context the operator needs to answer well"),
    },
    async execute(args) {
      const token = jobToken();
      if (!token) return "Not running under agentd (AGENTD_JOB_TOKEN unset); escalation not sent.";
      try {
        await postAgentd(`/jobs/${token}/escalate`, args);
      } catch (err) {
        return `Escalation not accepted: ${String(err)}. End your turn; the operator resolved the job already.`;
      }
      return "Escalation filed with agentd. End your turn now and wait for the operator.";
    },
  });
}
