// ---------------------------------------------------------------------------
// Secret-handling rules — injected into the system prompt. Behavioural
// reinforcement layered on top of the automatic redaction hook, so the model
// avoids surfacing secret values in the first place.
// ---------------------------------------------------------------------------
export const SECRET_HANDLING_RULES = `<secret-handling-rules>
## Handling Secrets

Never print, echo, or paste secret VALUES into your responses or into commands
whose output you will read. This includes passwords, API keys, tokens, private
keys, and 1Password/agenix contents.

- Reference secrets by indirection only. Prefer piping directly between tools
  (e.g. \`op read ... | tool\`), or assign to a shell variable in the SAME
  command that consumes it — do not run a command that prints the secret to
  stdout on its own.
- When you must place a secret in a file or env var, do it in one command that
  never emits the value (e.g. \`VAR="$(op read ...)" cmd\`), and mask it in any
  diagnostic output you request (e.g. pipe through \`sed 's/=.*/=<set>/'\`).
- Do not \`cat\`/\`Read\` files that hold secrets (token, password, credential,
  *.age, *.pem) unless strictly necessary; if you must, mask before displaying.
- If a secret value does end up in output, do not repeat it. Tool output is
  automatically redacted, but that is a backstop, not a licence to be careless.

</secret-handling-rules>`;
