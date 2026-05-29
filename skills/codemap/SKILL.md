# Codemap

Generate a hierarchical map of the current codebase to understand its structure.

## When to use

- Starting work in an unfamiliar codebase
- Need a high-level overview before diving into specifics
- Want to understand how modules/packages relate to each other

## How to use

Run the codemap script from the project root:

```bash
node ~/.config/opencode/skills/codemap/codemap.mjs [directory] [--depth N] [--output FILE]
```

**Arguments:**
- `directory` — Root directory to map (default: current directory)
- `--depth N` — Maximum directory depth (default: 4)
- `--output FILE` — Write output to file instead of stdout (default: `codemap.md`)

The output is a markdown document with:
1. **Directory tree** — Hierarchical folder structure with file counts
2. **File index** — Every source file grouped by directory with brief purpose annotation
3. **Entry points** — Identified main/index files and their exports
4. **Key patterns** — Detected frameworks, test setups, and build configurations

## Tips

- Run at the start of a session to build context before making changes
- The output is designed to be compact enough to fit in agent context
- Use `--depth 2` for large monorepos to keep output manageable
- Pipe to a file and read specific sections rather than loading the whole map
