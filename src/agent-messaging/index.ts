import { tool } from "@opencode-ai/plugin";
import { createOpencodeClient } from "@opencode-ai/sdk";
import { agentsDir, serversDir } from "./paths.js";
import { readMirror } from "./mirror.js";
import { readServerUrl } from "./server-registry.js";
import { sendToAgent } from "./send.js";

export { serversDir } from "./paths.js";
export { publishServer, unpublishServer } from "./publisher.js";

export function createSendToAgentTool(): ReturnType<typeof tool> {
  return tool({
    description:
      "Send a message to another opencode agent by its handle. Delivered as a real " +
      "message to that agent's session: it runs immediately if the agent is idle, or " +
      "queues if it is busy. A wrong handle returns the list of known agents.",
    args: {
      to: tool.schema.string().describe("Target agent handle (usually its worktree name)."),
      message: tool.schema.string().describe("The message to deliver."),
    },
    async execute(args, context) {
      const sDir = serversDir();
      const records = await readMirror(agentsDir());
      return sendToAgent(
        { to: args.to, message: args.message },
        {
          selfWorktree: context.worktree,
          records,
          readServerUrl: (p) => readServerUrl(sDir, p),
          makeClient: (baseUrl) => createOpencodeClient({ baseUrl }) as any,
        },
      );
    },
  });
}
