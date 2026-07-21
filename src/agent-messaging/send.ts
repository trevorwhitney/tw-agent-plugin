import { selectTarget, knownOpencodeHandles, type MirrorRecord } from "./mirror.js";
import { resolveSelfHandle, frameMessage } from "./framing.js";
import { normalizePath } from "./paths.js";

export type SendArgs = { to: string; message: string };

export type SendDeps = {
  selfWorktree: string;
  records: MirrorRecord[];
  readServerUrl: (worktreePath: string) => Promise<string | null>;
  makeClient: (baseUrl: string) => { session: { promptAsync: (opts: any) => Promise<any> } };
};

export async function sendToAgent(args: SendArgs, deps: SendDeps): Promise<string> {
  const target = selectTarget(deps.records, args.to);
  if (!target) {
    const known = knownOpencodeHandles(deps.records);
    return `Agent "${args.to}" not found. Known opencode agents: ${known.join(", ") || "(none)"}.`;
  }
  if (normalizePath(target.path) === normalizePath(deps.selfWorktree)) {
    return "Cannot send to self.";
  }
  if (!target.session_id) {
    return `Agent "${args.to}" session not ready yet — retry shortly.`;
  }
  const serverUrl = await deps.readServerUrl(target.path);
  if (!serverUrl) {
    return `Agent "${args.to}" server address unknown (it may be down or still starting).`;
  }
  const selfHandle = resolveSelfHandle(deps.records, deps.selfWorktree);
  const text = frameMessage(selfHandle, deps.selfWorktree, args.message);
  try {
    const client = deps.makeClient(serverUrl);
    const res = await client.session.promptAsync({
      path: { id: target.session_id },
      body: { parts: [{ type: "text", text }] },
    });
    if (res?.error) {
      return `Delivery to "${args.to}" was rejected: ${JSON.stringify(res.error)}`;
    }
  } catch {
    return `Agent "${args.to}" appears down — restart it so it re-advertises its server.`;
  }
  return `Delivered to ${args.to} (runs now if idle, queued if busy).`;
}
