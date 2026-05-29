// ---------------------------------------------------------------------------
// Todo auto-continuation — when the agent goes idle with incomplete todos,
// inject a nudge to continue working. Includes no-progress detection to
// avoid spinning. Inspired by oh-my-opencode-slim and willytop8/opencode-goal-plugin.
// ---------------------------------------------------------------------------
import type { PluginInput } from "@opencode-ai/plugin";

type OpencodeClient = PluginInput["client"];

interface AutoContinueState {
  enabledSessions: Set<string>;
  cooldownMs: number;
  lastContinueAt: Map<string, number>;
  sessionContinueCount: Map<string, number>;
  maxContinuesPerSession: number;
  /** Track consecutive low-output turns per session for no-progress detection */
  stalledTurns: Map<string, number>;
  /** Number of consecutive stalled turns before pausing */
  maxStalledTurns: number;
  /** Output character threshold below which a turn is considered "stalled" */
  stalledThresholdChars: number;
  /** Track consecutive prompt failures per session */
  promptFailures: Map<string, number>;
  maxPromptFailures: number;
}

const state: AutoContinueState = {
  enabledSessions: new Set(),
  cooldownMs: 3000,
  lastContinueAt: new Map(),
  sessionContinueCount: new Map(),
  maxContinuesPerSession: 20,
  stalledTurns: new Map(),
  maxStalledTurns: 3,
  stalledThresholdChars: 200,
  promptFailures: new Map(),
  maxPromptFailures: 3,
};

export function isAutoContinueEnabled(sessionID: string): boolean {
  return state.enabledSessions.has(sessionID);
}

export function setAutoContinue(sessionID: string, enabled: boolean): void {
  if (enabled) {
    state.enabledSessions.add(sessionID);
  } else {
    state.enabledSessions.delete(sessionID);
  }
}

/**
 * Record the length of the last assistant response for no-progress detection.
 * Call this from the event handler when a message completes.
 */
export function recordAssistantOutput(sessionID: string, charCount: number): void {
  if (charCount < state.stalledThresholdChars) {
    state.stalledTurns.set(sessionID, (state.stalledTurns.get(sessionID) ?? 0) + 1);
  } else {
    state.stalledTurns.set(sessionID, 0);
  }
}

export type ContinueResult =
  | { continued: true }
  | { continued: false; reason: "disabled" | "cooldown" | "limit" | "no-todos" | "stalled" | "prompt-failed" | "error" };

/**
 * Called when a session goes idle. If auto-continue is enabled and there are
 * incomplete todos, sends an async continuation prompt to the session.
 *
 * Options:
 * - activeGoal: if set, includes the goal in the continuation message
 */
export async function handleSessionIdle(
  client: OpencodeClient,
  sessionID: string,
  options?: { activeGoal?: string },
): Promise<ContinueResult> {
  if (!isAutoContinueEnabled(sessionID)) return { continued: false, reason: "disabled" };

  // Cooldown check
  const now = Date.now();
  const lastContinue = state.lastContinueAt.get(sessionID) ?? -Infinity;
  if (now - lastContinue < state.cooldownMs) return { continued: false, reason: "cooldown" };

   // Prompt failure check
   const failures = state.promptFailures.get(sessionID) ?? 0;
   if (failures >= state.maxPromptFailures) {
     state.enabledSessions.delete(sessionID);
     return { continued: false, reason: "prompt-failed" };
   }

  // No-progress detection: pause if too many consecutive stalled turns
  const stalled = state.stalledTurns.get(sessionID) ?? 0;
  if (stalled >= state.maxStalledTurns) {
    // Send a wrap-up prompt instead of stopping silently
    try {
      await client.session.promptAsync({
        path: { id: sessionID },
        body: {
          parts: [{
            type: "text",
            text: "[auto-continue: stalled] The last few turns produced very little output. Summarize: (1) what has been completed, (2) what remains, (3) what the concrete next step is. Then disable auto-continue.",
          }],
        },
      });
    } catch { /* best effort */ }
    state.enabledSessions.delete(sessionID);
    state.stalledTurns.set(sessionID, 0);
    return { continued: false, reason: "stalled" };
  }

  // Per-session limit check — wrap up instead of hard stop
  const count = state.sessionContinueCount.get(sessionID) ?? 0;
  if (count >= state.maxContinuesPerSession) {
    try {
      await client.session.promptAsync({
        path: { id: sessionID },
        body: {
          parts: [{
            type: "text",
            text: "[auto-continue: limit reached] Auto-continue turn limit reached. Summarize: (1) what has been completed, (2) what remains, (3) what the concrete next step is. Then disable auto-continue.",
          }],
        },
      });
    } catch { /* best effort */ }
    state.enabledSessions.delete(sessionID);
    return { continued: false, reason: "limit" };
  }

  // Check for incomplete todos before sending continuation
  try {
    const todosResponse = await client.session.todo({ path: { id: sessionID } });
    const todos = todosResponse.data ?? [];
    const hasIncomplete = todos.some(
      (t) => t.status === "pending" || t.status === "in_progress"
    );
    if (!hasIncomplete) return { continued: false, reason: "no-todos" };
  } catch {
    return { continued: false, reason: "error" };
  }

  state.lastContinueAt.set(sessionID, now);
  state.sessionContinueCount.set(sessionID, count + 1);

  const goalReminder = options?.activeGoal
    ? ` Remember the session goal: "${options.activeGoal}".`
    : "";

  try {
    await client.session.promptAsync({
      path: { id: sessionID },
      body: {
        parts: [
          {
            type: "text",
            text: `[auto-continue] You have incomplete todos remaining. Continue working on the next pending item.${goalReminder} If all work is actually complete, mark remaining todos as completed or cancelled, disable auto-continue, and check \`bd ready\` for any beads issues ready to work on.`,
          },
        ],
      },
    });
    state.promptFailures.set(sessionID, 0);
    return { continued: true };
  } catch {
    state.promptFailures.set(sessionID, failures + 1);
    return { continued: false, reason: "prompt-failed" };
  }
}

export function resetSessionContinueCount(sessionID: string): void {
  state.sessionContinueCount.delete(sessionID);
  state.stalledTurns.delete(sessionID);
  state.promptFailures.delete(sessionID);
}

/** @internal For testing only */
export function __resetInternalState(): void {
  state.enabledSessions.clear();
  state.lastContinueAt.clear();
  state.sessionContinueCount.clear();
  state.stalledTurns.clear();
  state.promptFailures.clear();
}
