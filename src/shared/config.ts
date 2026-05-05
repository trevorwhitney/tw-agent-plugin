import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

const DEFAULT_TIMEOUT_MS = 300_000;

// ────────────────────────── Pi side ──────────────────────────

export type EnsembleConfig = { agents: string[] };

export type PiReviewConfig = {
  "code-review": EnsembleConfig;
  "plan-review": EnsembleConfig;
  "spec-review": EnsembleConfig;
  timeoutMs: number;
};

export type PiPluginConfig = { review: PiReviewConfig };

const PI_DEFAULT_ENSEMBLES: PiReviewConfig = {
  "code-review": { agents: ["code-reviewer", "spec-reviewer", "challenger"] },
  "plan-review": { agents: ["challenger", "brainstormer"] },
  "spec-review": { agents: ["challenger", "brainstormer"] },
  timeoutMs: DEFAULT_TIMEOUT_MS,
};

const PI_CONFIG_PATH = join(homedir(), ".pi", "agent", "tw-plugin.json");

type ReviewType = "code-review" | "plan-review" | "spec-review";

function legacyAgentArray(raw: any): string[] | null {
  const review = raw?.review;
  if (Array.isArray(review?.agents) && review.agents.length > 0) {
    return [...review.agents];
  }
  if (review?.agentA || review?.agentB) {
    return [
      review.agentA ?? PI_DEFAULT_ENSEMBLES["code-review"].agents[0],
      review.agentB ?? PI_DEFAULT_ENSEMBLES["code-review"].agents[1],
    ];
  }
  return null;
}

function resolvePiEnsemble(type: ReviewType, raw: any): EnsembleConfig {
  const perType = raw?.review?.[type];
  if (perType && Array.isArray(perType.agents) && perType.agents.length > 0) {
    return { agents: perType.agents };
  }
  const legacy = legacyAgentArray(raw);
  if (legacy) return { agents: legacy };
  return { agents: [...PI_DEFAULT_ENSEMBLES[type].agents] };
}

export async function loadPiPluginConfig(
  opts: { configPath?: string } = {},
): Promise<PiPluginConfig> {
  const configPath = opts.configPath ?? PI_CONFIG_PATH;
  let raw: any = {};
  try {
    raw = JSON.parse(await readFile(configPath, "utf-8"));
  } catch {
    raw = {};
  }
  const review: PiReviewConfig = {
    "code-review": resolvePiEnsemble("code-review", raw),
    "plan-review": resolvePiEnsemble("plan-review", raw),
    "spec-review": resolvePiEnsemble("spec-review", raw),
    timeoutMs:
      typeof raw?.review?.timeoutMs === "number" && raw.review.timeoutMs > 0
        ? raw.review.timeoutMs
        : DEFAULT_TIMEOUT_MS,
  };
  return { review };
}

export async function loadPiReviewConfig(
  opts: { configPath?: string } = {},
): Promise<PiReviewConfig> {
  return (await loadPiPluginConfig(opts)).review;
}

// ────────────────────────── OpenCode side ──────────────────────────

export type OpencodeReviewConfig = { agents: string[]; timeoutMs: number };
export type OpencodePluginConfig = { review: OpencodeReviewConfig };

const OPENCODE_DEFAULTS: OpencodeReviewConfig = {
  // Preserve historical order: codex first, then opus, then sonnet.
  agents: ["critic-codex", "critic-opus", "critic-sonnet"],
  timeoutMs: DEFAULT_TIMEOUT_MS,
};

const OPENCODE_CONFIG_PATH = join(homedir(), ".config", "opencode", "tw-plugin.json");

export async function loadOpencodePluginConfig(
  opts: { configPath?: string } = {},
): Promise<OpencodePluginConfig> {
  const configPath = opts.configPath ?? OPENCODE_CONFIG_PATH;
  let raw: any = {};
  try {
    raw = JSON.parse(await readFile(configPath, "utf-8"));
  } catch {
    raw = {};
  }
  const review = raw?.review;
  let agents: string[];
  if (Array.isArray(review?.agents) && review.agents.length > 0) {
    agents = [...review.agents];
  } else if (review?.agentA || review?.agentB) {
    agents = [
      review.agentA ?? OPENCODE_DEFAULTS.agents[0],
      review.agentB ?? OPENCODE_DEFAULTS.agents[1],
    ];
  } else {
    agents = [...OPENCODE_DEFAULTS.agents];
  }
  const timeoutMs =
    typeof review?.timeoutMs === "number" && review.timeoutMs > 0
      ? review.timeoutMs
      : DEFAULT_TIMEOUT_MS;
  return { review: { agents, timeoutMs } };
}

export async function loadOpencodeReviewConfig(
  opts: { configPath?: string } = {},
): Promise<OpencodeReviewConfig> {
  return (await loadOpencodePluginConfig(opts)).review;
}
