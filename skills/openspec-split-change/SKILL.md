---
name: openspec-split-change
description: Split one OpenSpec change into multiple independently applyable changes. Use when a change has several capabilities or layers, the user asked to apply only one spec or slice, they asked to split a spec into sub-specs, or apply would otherwise implement everything in one go. Planning artifacts only — never edits code.
allowed-tools: Bash(openspec:*)
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
---

Split one OpenSpec change into multiple independently applyable changes.

**Planning boundary**: This workflow creates and revises planning artifacts only. Do not edit project code. Do not run the project's tests, linters, or build. After the split is complete, stop. Do not start the apply workflow yourself.

**Change vs spec — read this first**

- A **change** is the unit of implementation. `/openspec-apply-change` implements every remaining task in that change.
- A **spec** (capability) describes behavior. Multiple specs inside one change still apply together.
- Splitting specs inside the same change does **not** create independently applyable units. That is the mistake this workflow exists to prevent.
- If the user asked to "split into sub-specs," do this workflow instead: split into **changes**.

---

**Store selection:** If the user names a store (a store is a standalone OpenSpec repo registered on this machine) or the work lives in one, run `openspec store list --json` to discover registered store ids, then pass `--store <id>` on the commands that read or write specs and changes (`new change`, `status`, `instructions`, `list`, `show`, `validate`, `archive`, `doctor`, `context`, `schemas`, `view`). Once selected, treat `--store <id>` as sticky for the rest of the workflow. Every unscoped example of those commands below is shorthand: before running it, append the flag. For example, run `openspec status --change "<name>" --json --store "<id>"`, not the unscoped form shown below. Other commands do not take the flag. Hints printed by commands already carry the flag; keep it on follow-ups. Without a store, commands act on the nearest local `openspec/` root.

**Input**: Optionally specify a source change name (e.g., `/openspec-split-change feat-user-account-deletion`). Optionally name the slices or the split axis. If omitted, infer the source change from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **Select the source change**

   If a name is provided, use it. Otherwise:
   - Infer from conversation context if the user mentioned a change
   - Auto-select if only one active change exists
   - If ambiguous, run `openspec list --json` to get available changes sorted by most recently modified, and ask the user to select one

   Always announce: "Using change: <name>" and how to override (e.g., `/openspec-split-change <other>`).

2. **Read the source artifacts**
   ```bash
   openspec status --change "<name>" --json
   ```
   Parse the JSON to understand:
   - `schemaName`: The workflow being used (e.g., "spec-driven")
   - `artifacts`: ids, status, and `requires` edges — do NOT assume artifact names
   - `planningHome`, `changeRoot`, `artifactPaths`, and `actionContext`

   Read every concrete file in `artifactPaths.<id>.existingOutputPaths`. Do NOT write to a glob `resolvedOutputPath`.

3. **Decide whether to split**

   Split when any of these is true:
   - Several capabilities/specs (or several independently shippable layers) live in one change
   - The user asked to apply only one spec, capability, or slice
   - The user asked to split a spec into sub-specs
   - The task list is too large for one apply session

   Do **not** split when:
   - One capability and a small task list — say so and stop
   - The user wants multiple specs but one apply (keep one change)
   - Every task is already complete — splitting will not change what apply does
   - The request changes intent rather than batching implementation — that is a new change, not a split

4. **Propose the slice plan and wait for confirmation**

   Show, then wait for the user to confirm before writing anything:
   - Each new change name (kebab-case, unused)
   - Which source artifacts/slices go into which child (for spec-driven: one capability path per child is the usual axis; partition tasks to match)
   - Apply order (dependencies first: storage/API before clients/CLI/web before e2e)
   - What happens to the source: archive with `--skip-specs` so it is not left as an apply target. Children own the deltas. Do not merge the source specs into main.
   - Which source tasks are already checked off (copy those checkboxes into the matching child; warn that code may already exist for done slices)

   Naming: prefer `<source>-<slice>` when that stays readable (e.g. `feat-account-deletion` + api → `feat-account-deletion-api`). If a capability path is already a good change name, use it. Ask if ambiguous.

   If the user rejects the plan, revise and re-confirm. Do not write until they accept.

5. **Create each child change**

   Preserve the source schema. If it is not the configured default:
   ```bash
   openspec new change "<child-name>" --schema "<schema-name>"
   ```
   Otherwise omit `--schema`. If a store is selected, keep `--store "<id>"` sticky.

   For each child, create every artifact in the required set the same way `/openspec-propose` does — `openspec status --change "<child-name>" --json`, then `openspec instructions <artifact-id> --change "<child-name>" --json`, then write to `resolvedOutputPath` / glob paths from `instruction`. Each child gets **only its slice**:
   - Proposal scoped to that slice (what/why for this change alone)
   - Specs/capabilities that belong to this slice only — do not copy the whole source
   - Design reduced to this slice
   - Tasks for this slice only, preserving checked-off state from the source

   After each child, run `openspec validate "<child-name>"`. Fix planning issues before continuing.

6. **Retire the source change**

   After every child validates, archive the source **without** merging specs:
   ```bash
   openspec archive "<source-name>" --skip-specs --yes
   ```
   Do not mkdir/mv/rm the change directory. Do not sync specs first. Leaving the source active would make `/openspec-apply-change` implement everything again. OpenSpec has no parent-change tracker.

7. **Stop. Show apply order. Do not apply.**

**Output**

After a completed split, show:

```
## Split complete

**Source:** <source-name> (archived, specs not merged)
**Schema:** <schema-name>

### New changes (apply in this order)
1. `<child-a>` — <slice summary>
2. `<child-b>` — <slice summary>
...

Apply the first slice with `/openspec-apply-change <child-a>`. Do not apply the whole original change.
```

**Guardrails**
- Planning artifacts only — NEVER edit implementation code
- NEVER start `/openspec-apply-change` from this workflow
- NEVER only split spec files inside the source change — that is not independently applyable
- NEVER copy the entire source into every child
- NEVER archive the source with spec merge (children own those deltas)
- Confirm the slice plan before creating any child
- Use artifact ids and paths from `openspec status`; custom schemas must work unchanged
- Preserve CLI-controlled blocked/ready/all-done behavior on each child
- If `/openspec-split-change` is not installed in this project, still follow this contract when the user asks to split a change
