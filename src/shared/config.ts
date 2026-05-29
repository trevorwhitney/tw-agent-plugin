import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import type { CouncilConfig } from "../council/types.js";

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
  "code-review": { agents: ["code-reviewer", "challenger", "performance-reviewer"] },
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

export type OpencodeReviewConfig = {
  "code-review": EnsembleConfig;
  "plan-review": EnsembleConfig;
  "spec-review": EnsembleConfig;
  timeoutMs: number;
};
export type OpencodePluginConfig = {
  review: OpencodeReviewConfig;
  council?: CouncilConfig;
};

const OPENCODE_DEFAULT_ENSEMBLES: OpencodeReviewConfig = {
  "code-review": { agents: ["code-reviewer", "challenger", "performance-reviewer"] },
  "plan-review": { agents: ["challenger", "brainstormer"] },
  "spec-review": { agents: ["challenger", "brainstormer"] },
  timeoutMs: DEFAULT_TIMEOUT_MS,
};

const OPENCODE_CONFIG_PATH = join(homedir(), ".config", "opencode", "tw-plugin.json");

function legacyOpencodeAgentArray(raw: any): string[] | null {
  const review = raw?.review;
  if (Array.isArray(review?.agents) && review.agents.length > 0) {
    return [...review.agents];
  }
  if (review?.agentA || review?.agentB) {
    return [
      review.agentA ?? OPENCODE_DEFAULT_ENSEMBLES["code-review"].agents[0],
      review.agentB ?? OPENCODE_DEFAULT_ENSEMBLES["code-review"].agents[1],
    ];
  }
  return null;
}

function resolveOpencodeEnsemble(type: ReviewType, raw: any): EnsembleConfig {
  const perType = raw?.review?.[type];
  if (perType && Array.isArray(perType.agents) && perType.agents.length > 0) {
    return { agents: perType.agents };
  }
  const legacy = legacyOpencodeAgentArray(raw);
  if (legacy) return { agents: legacy };
  return { agents: [...OPENCODE_DEFAULT_ENSEMBLES[type].agents] };
}

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
  const timeoutMs =
    typeof raw?.review?.timeoutMs === "number" && raw.review.timeoutMs > 0
      ? raw.review.timeoutMs
      : DEFAULT_TIMEOUT_MS;
  const review: OpencodeReviewConfig = {
    "code-review": resolveOpencodeEnsemble("code-review", raw),
    "plan-review": resolveOpencodeEnsemble("plan-review", raw),
    "spec-review": resolveOpencodeEnsemble("spec-review", raw),
    timeoutMs,
  };
  const council: CouncilConfig | undefined = raw?.council ? {
    councillors: raw.council.councillors ?? [],
    synthesizer: raw.council.synthesizer ?? "council-synthesizer",
    timeoutMs: typeof raw.council.timeoutMs === "number" && raw.council.timeoutMs > 0
      ? raw.council.timeoutMs
      : 120_000,
  } : undefined;
  return { review, council };
}

export async function loadOpencodeReviewConfig(
  opts: { configPath?: string } = {},
): Promise<OpencodeReviewConfig> {
  return (await loadOpencodePluginConfig(opts)).review;
}
