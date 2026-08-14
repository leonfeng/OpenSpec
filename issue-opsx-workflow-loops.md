# `/opsx:apply`, `/opsx:archive`, `/opsx:propose`, and `/opsx:explore` loop on local coding models

**Suggested labels:** `bug`

## Summary

Dogfooding OpenSpec with OpenCode and a local coding model (KAT-Coder-Dev on vLLM) showed stuck loops in apply, archive, propose, explore, and freeform “fix this” turns. Stronger hosted models usually infer the intended next step and move on. This model followed the skill/command text literally, then improvised recovery, so the same instruction gaps became infinite tool loops and in one case deleted the change directory.

These are OpenSpec instruction-contract bugs, not “the model is broken.” Apply, archive, and propose are agent-orchestrated: they only work if the model fills in intent that the text does not state.

A fix is on `fix/apply-rewrite-loop` (`ca2d573`, `19e09da`, `457d713`). This issue is the write-up of what happened and why.

## Environment

- OpenSpec CLI built from this repo (1.8.0 line)
- OpenCode 1.18.x, slash commands `/opsx-propose`, `/opsx-apply`, `/opsx-archive`, `/opsx-explore`
- Model: KAT-Coder-Dev served with vLLM (`presence_penalty` 0; OpenCode does not expose frequency/presence penalty)
- Dogfood project: a small Python CLI (`snekdo`) with spec-driven changes (`add-todo-item`, `add-todo-modification`, `priority`, `nanoid`, then `feat-sort-todo-list`)

## What happened

### 1. `/opsx:apply` rewrote the same file forever

On `add-todo-item`, apply wrote `storage.py` **15 times**. Writes 7–19 were identical. The tool result was always `Wrote file successfully.` Task checkboxes stayed unchecked. The run was cancelled around step 18.

A later apply on the same change implemented real files (`tests/test_models.py`, `test_storage.py`, `__main__.py`, `test_cli.py`), then **alternated `README.md` and `pytest.ini`**. Compaction happened in between. Checkboxes for those files never updated.

**Why**

- Apply said “loop until done” but did not require a tasks-file checkbox edit as the **next** tool call after every implementation write.
- It never said “if this path already exists from a successful write, mark the task complete; do not rewrite it.”
- “Don’t rewrite the same file twice **in a row**” (once that was added locally) still allows A→B→A.
- `tasks.md` split one file into per-method checkboxes. This model implements by dumping the whole file, so every remaining storage task mapped to “write `storage.py` again.”

### 2. `/opsx:archive` re-read `openspec-sync-specs/SKILL.md` until abort

Archive on `add-todo-modification` looked like “repeated failures to read `.opencode/skills/openspec-sync-specs/SKILL.md`.” The reads actually **succeeded**. The model opened the same skill file over and over until the last read was aborted.

**Why**

- Archive said: run the `openspec-sync-specs` / `/opsx:sync` workflow **inline**. That names a skill. The model treated it as “find and read `SKILL.md`,” not “merge specs in this conversation.”
- `openspec/specs/` was empty because an earlier archive of `add-todo-item` moved the change **without** syncing main specs. A missing main spec looked like a search problem. A glob for `*specs*` hit the skill path (the name contains `specs`).
- The agent also listed `changeRoot/archive/` (wrong: archive lives at `openspec/changes/archive/`, a sibling of the change).

Related config footgun: unquoted YAML `loop: stop` in `operations.apply.guidance` parsed as a mapping, so apply guidance was dropped with `Guidance for operation 'apply' must be an array of strings`.

### 3. `/opsx:archive` created and deleted archive directories, then deleted the change

After the skill-read wording was tightened, a fresh archive **did** write `openspec/specs/todo-modification/spec.md`. Then it looped on the filesystem:

1. `mkdir` **inside** the change: `openspec/changes/add-todo-modification/archive`
2. `mv` the change into that nested archive → `cannot move to a subdirectory of itself`
3. `mv` the change to `add-todo-modification.archive` (rename in `changes/`, no date prefix)
4. `rm -rf add-todo-modification.archive` — **deleted the change** (proposal, design, tasks, delta spec; none of it was committed)
5. mkdir empty `changes/add-todo-modification` and `archive/add-todo-modification`, copy nothing, `rm -rf`, repeat with `.gitkeep` placeholders until abort

**Why**

- Archive showed agent `mkdir -p "<planningHome.changesDir>/archive"` then `mv "<changeRoot>" .../archive/<target-name>`. The model resolved the parent as `changeRoot/archive`.
- Error copy offered “Delete the existing archive if it's a duplicate,” which invited `rm -rf`.
- On `mv` failure the model improvised recovery instead of stopping.

### 4. `/opsx:propose` auto-started apply, then looped on pytest and existing syntax errors

Propose already said “planning artifacts only” and “do not edit project code.” The same text then told the model to start apply.

**`priority`:** wrote all four artifacts, then loaded the apply skill in the same session because:

- The opening boundary said: “Wait for a new user request after the artifacts are presented; **then start the apply workflow**.”
- The skill closing prompt said: “When you are ready, run `/opsx:apply` **or ask me to apply this change**.”

Apply then `sed`-looped on broken quotes in `tests/test_cli.py` (`patch('snekdo.__main__.TodoStorage)`).

**`nanoid`:** created `openspec/changes/nanoid/`, never wrote `proposal.md`, and looped on pytest / AST parse / grep of that same `test_cli.py` syntax error until abort.

**Why**

- “Then start the apply workflow” and “ask me to apply this change” are easy to read as the next tool step, not as a message for the user.
- Naming `/opsx:apply` caused the model to invoke the apply skill in the same turn (same class of bug as archive naming `openspec-sync-specs`).
- Propose forbade editing project code but never said “don’t run tests, linters, or builds” or “don’t fix existing project bugs.” Investigating the codebase became the loop instead of writing planning files.

### 5. Sorting fix: explore pytest-loop, then freeform `python -c` / test-rewrite loops

Trying to fix todo-list sorting produced three more stuck runs, none of which needed a new skill-file hunt:

1. **`ses_0058b95e0ffeeHPV2cLI5qVnrp` (`/opsx:explore`)** — user: default `list` is not sorting by `created_at`. Explore ran `python -m pytest tests/test_cli.py -xvs -k "sort"` **over and over** (same command, same result) until abort. No writes. Explore is “thinking, not implementing,” but it never said “don’t rerun a completed command” or “stop after answering.”
2. **`ses_005ae009dffe3XiKgBTERxIwMO` (freeform “investigate and fix”)** — default sort is title reverse. Searched for `.ts` files in a Python repo, ran pytest a few times, then repeated the same `python -c` / `handle_list` snippet until abort. Never wrote a fix.
3. **`ses_005c271a8ffeh8EJIWMTta4GZN` (freeform “`--sort` does nothing”)** — actually found the hardcoded `created_at` / `reverse=True` bug in `snekdo/__main__.py`, tests passed, user asked for coverage. Then **rewrote `tests/test_cli.py` 9 times** and `__main__.py` 4 times. After compaction (“Continue if you have next steps”), it looped identical `python -c` argparse snippets until abort.

An earlier session on the same feature (`ses_005d69e6dffeu2qAxbRnalkHCh`) also chained explore → “Fix those test failures” → propose → apply → archive (wrong path `archive/feat-sort-todo-list/` with no date prefix) → sync → archive again → pytest until abort, because explore will implement if the user says “fix it.”

**Why**

- Repeating a successful `pytest` or `python -c` was never called a loop. Compaction’s “continue if you have next steps” restarts the same command.
- Explore forbade writing application code but allowed unbounded investigation, including the test runner.
- “Fix it” inside explore overrode “remind them to exit explore first.”
- Freeform fix turns do not load `/opsx:apply`, so apply’s checkbox-after-write contract never applies — the same whole-file rewrite of `test_cli.py` comes back.

## Expected

- Apply: one write per deliverable, checkbox update immediately after, then the next unfinished task. An already-written file is done. Cycling two files with no checkbox update is a stop, not a strategy.
- Archive: merge delta specs in the same turn (create main spec from ADDED when missing). Then move the change **once** to `openspec/changes/archive/YYYY-MM-DD-<name>/`. Never mkdir inside `changeRoot`. Never delete `changeRoot` on failure.
- Propose: create the change and write planning artifacts, then **stop**. Do not invoke apply. Do not run the test suite or repair existing project bugs. README and existing main specs are enough context.
- Explore: read and explain. Do not implement, even if the user says “fix it.” Do not rerun `pytest` / `python -c`. After answering, stop.
- Any workflow: a shell command that already completed must not be run again. After tests pass, stop unless a later unfinished task requires them.

## Actual

Tool loops until the user cancels. Archive destroyed a change directory. Propose either jumped into apply (and a `sed` loop) or never wrote artifacts and grepped a pre-existing syntax error forever. Explore and freeform “fix this” repeated the same `pytest` / `python -c` until abort, and rewrote `test_cli.py` many times after the sort bug was already fixed.

## Root cause

OPSX apply/archive/propose/sync assume a model that:

- Distinguishes “execute this workflow’s logic here” from “open the named skill file” or “run the named slash command now”
- Treats “when you are ready, run `/opsx:apply`” as user-facing, not as the next tool call
- Resolves `planningHome.changesDir` vs `changeRoot`
- Stops after a successful write/`mv`/artifact set
- Does not `rm -rf`, `sed`, or pytest to recover from an unrelated failure
- Does not rerun `pytest` or `python -c` after it already completed

That is a reasonable assumption for Claude-class models. It is a bad contract for local coding models. The workflows still need to be safe when the model does exactly what the text says.

## Fix (on branch, PR not opened yet)

Branch: `fix/apply-rewrite-loop`

- `ca2d573` — `fix(templates): stop apply rewrite and archive skill/mkdir loops`
- `19e09da` — `fix(templates): stop propose from auto-applying and exploring the codebase`
- `457d713` — `fix(templates): stop explore/apply from repeating completed shell commands`

- **Apply:** checkbox edit must be the next tool call after every implementation write; already-written files are marked complete; A→B→A with no checkbox update is a loop. Schema/docs: each checkbox is a deliverable, not a method inside a file.
- **Archive sync:** merge ADDED/MODIFIED/REMOVED/RENAMED inline. Do not name `openspec-sync-specs` or `/opsx:sync`. Missing main spec → create from ADDED; do not glob `*specs*`. Do not re-read a path that already succeeded.
- **Archive move:** after sync (or skip), run exactly `openspec archive "<name>" --skip-specs --yes`. No agent `mkdir`/`mv`/`rm`. Creating a directory and then deleting it is a loop. Error text no longer tells the agent to delete an existing archive.
- **Propose:** do not start apply yourself; “When you are ready, run `/opsx:apply`” is for the user. Do not run tests/linters/builds or grep package/test source. After `openspec new change`, write the proposal next. Do not rewrite an artifact that already exists.
- **Explore / command-repeat:** do not implement from explore even if the user says “fix it”; do not invoke apply/archive/sync; a repeated shell command (`pytest`, `python -c`, grep, ls) is a loop. Apply: after tests pass, do not rerun them unless a later unfinished task requires it.

Remaining gap: freeform “fix this” turns still do not load `/opsx:apply` or `/opsx:explore`, so checkbox-after-write and the explore “don’t implement” contract never apply. That is local OpenCode extra instructions, not an OpenSpec template.

## How to reproduce (pre-fix templates)

1. Point OpenCode at a local coding model (whole-file rewrite, weak instruction following).
2. `openspec init` a small project; `/opsx-new` + `/opsx-apply` a change whose `tasks.md` has several checkboxes against the same source file.
3. Observe identical rewrites and stale checkboxes.
4. `/opsx-archive` the change. Observe skill-file re-reads and/or `mkdir`/`mv`/`rm` under `changeRoot/archive` instead of `openspec/changes/archive/YYYY-MM-DD-<name>/`.
5. `/opsx:propose` a new change. Observe either (a) artifacts written then apply starting in the same turn, or (b) pytest/grep of project code with no `proposal.md`.
6. `/opsx:explore` a small bug, or ask in freeform to “fix” it. Observe the same `pytest` or `python -c` command repeating until abort, or `test_*.py` rewritten after tests already passed.
