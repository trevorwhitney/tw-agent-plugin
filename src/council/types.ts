export interface CouncilConfig {
  /** Models to use as councillors — each gets the same prompt independently */
  councillors: Array<{ providerID: string; modelID: string }>;
  /** Agent name for the synthesizer (must be defined in ~/.config/opencode/agents/) */
  synthesizer: string;
  /** Timeout per councillor in ms */
  timeoutMs: number;
}

export interface CouncilResult {
  synthesis: string;
  opinions: Array<{
    model: string;
    response: string;
    error?: string;
  }>;
}
