// ---------------------------------------------------------------------------
// Secret redaction — strips credential values out of tool output before it
// reaches the model context. Two layers:
//
//   1. A dynamic registry of exact secret values captured from known secret
//      sources (e.g. `op read`, reading a *token/*password file). Once a value
//      is registered, every subsequent tool output has that exact string
//      masked. This is the strongest layer: zero false positives, and it
//      catches secrets regardless of how they later appear.
//
//   2. Pattern-based masking for well-known credential shapes (Plex tokens,
//      `password=`/`token=` assignments, Authorization headers, PEM blocks).
//      A backstop for values that were never explicitly fetched.
//
// The registry is process-global and best-effort: it only grows, and short
// values are ignored to avoid masking common substrings.
// ---------------------------------------------------------------------------

const MASK = "[REDACTED]";

// Minimum length for a captured value to be worth registering/masking. Short
// strings (e.g. a 4-char username) would cause noisy false positives.
const MIN_SECRET_LEN = 8;

const registry = new Set<string>();

/** Register an exact secret value so it is masked in all future tool output. */
export function registerSecret(value: string | undefined | null): void {
  if (!value) return;
  const trimmed = value.trim();
  if (trimmed.length < MIN_SECRET_LEN) return;
  registry.add(trimmed);
}

/** Test-only: clear the registry between cases. */
export function _resetRegistry(): void {
  registry.clear();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Credential-shaped patterns. Each captures the secret in group 1 (or the whole
// match) and is replaced with the surrounding context preserved where useful.
const PATTERNS: Array<{ re: RegExp; replace: (m: string, ...g: string[]) => string }> = [
  // key=value / key: value for sensitive keys (password, pass, token, secret,
  // api_key, passwd, pat)
  {
    re: /\b([A-Za-z0-9_]*(?:password|passwd|pass|secret|token|api[_-]?key|apikey|access[_-]?key|pat)[A-Za-z0-9_]*)\s*([=:])\s*("?)([^\s"'#]{6,})\3/gi,
    replace: (_m, key, sep, quote) => `${key}${sep}${quote}${MASK}${quote}`,
  },
  // X-Plex-Token in URLs/query strings
  {
    re: /(X-Plex-Token[=:])\s*([A-Za-z0-9_-]{8,})/gi,
    replace: (_m, pre) => `${pre}${MASK}`,
  },
  // Plex PlexOnlineToken="..."
  {
    re: /(PlexOnlineToken=")([^"]{8,})(")/g,
    replace: (_m, pre, _v, post) => `${pre}${MASK}${post}`,
  },
  // Authorization: Bearer / Basic
  {
    re: /(Authorization:\s*(?:Bearer|Basic)\s+)([A-Za-z0-9._\-+/=]{8,})/gi,
    replace: (_m, pre) => `${pre}${MASK}`,
  },
  // PEM private key blocks
  {
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replace: () => `${MASK}`,
  },
];

/** Mask registered exact secrets and credential-shaped patterns in text. */
export function redact(text: string): string {
  if (!text) return text;
  let out = text;

  // Layer 1: exact registered values (longest first, so overlapping values
  // mask fully rather than partially).
  const values = [...registry].sort((a, b) => b.length - a.length);
  for (const v of values) {
    out = out.replace(new RegExp(escapeRegExp(v), "g"), MASK);
  }

  // Layer 2: pattern-based.
  for (const { re, replace } of PATTERNS) {
    out = out.replace(re, replace as (substring: string, ...args: any[]) => string);
  }

  return out;
}

// Commands whose stdout is a raw secret we should capture wholesale into the
// registry (the entire trimmed output is the secret value).
const RAW_SECRET_COMMAND_RE =
  /\bop\s+read\b|\bop\s+item\s+get\b.*--reveal|PlexOnlineToken|agenix\s+-d\b/;

/**
 * Given a command string and its stdout, capture any values that should be
 * treated as secrets in future output. Best-effort heuristics tuned for the
 * tools this environment uses (1Password `op`, agenix, Plex token files).
 */
export function captureSecretsFromCommand(command: string, stdout: string): void {
  if (!stdout) return;
  if (RAW_SECRET_COMMAND_RE.test(command)) {
    // `op read` etc. print just the secret on stdout.
    for (const line of stdout.split("\n")) {
      registerSecret(line);
    }
  }
  // KEY=value lines that look like credentials (covers agenix env files,
  // `op inject` output, .env dumps).
  const kvRe =
    /\b[A-Za-z0-9_]*(?:password|passwd|pass|secret|token|api[_-]?key|apikey|pat)[A-Za-z0-9_]*\s*[=:]\s*"?([^\s"'#]{6,})"?/gi;
  let m: RegExpExecArray | null;
  while ((m = kvRe.exec(stdout)) !== null) {
    registerSecret(m[1]);
  }
}

/**
 * If a file path looks like it holds a secret (token/password/credential/.age),
 * treat its whole content as a secret value to register.
 */
export function captureSecretsFromFileRead(path: string, content: string): void {
  if (!content) return;
  if (/(token|password|passwd|secret|credential|\.age$|_key$|\.pem$)/i.test(path)) {
    for (const line of content.split("\n")) {
      registerSecret(line);
    }
  }
}
