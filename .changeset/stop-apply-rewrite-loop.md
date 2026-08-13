---
"@fission-ai/openspec": patch
---

### Bug Fixes

- **Apply rewrite loops** — `/opsx:apply` now requires a tasks-file checkbox edit as the next tool call after every implementation write, treats an already-written file as done instead of rewriting it, and treats cycling two or more files with no checkbox update as a loop. Task lists are also steered away from one-checkbox-per-method splits that caused local coding models to regenerate files forever.
- **Archive skill-read loops** — `/opsx:archive` merges delta specs inline instead of telling the agent to run `openspec-sync-specs` / `/opsx:sync`. That named-skill wording made local coding models re-read `.opencode/skills/openspec-sync-specs/SKILL.md` until abort. A missing main spec is now treated as create-from-ADDED, not a search for other `*specs*` paths.
- **Archive mkdir/rm loops** — after sync, `/opsx:archive` moves the change with `openspec archive --skip-specs --yes` instead of agent `mkdir`/`mv`/`rm`. Hand-rolled moves created `changeRoot/archive`, failed a self-move, then deleted and recreated empty archive directories until abort.
- **Propose apply/explore loops** — `/opsx:propose` no longer says "then start the apply workflow" or "ask me to apply this change", which made local coding models load apply in the same turn. It also forbids running tests, fixing project bugs, or grepping package/test source before writing planning artifacts.
