---
"@fission-ai/openspec": minor
---

### Features

- **Split change workflow** — `/opsx:split` turns one fat change into multiple independently applyable changes. Specs (capabilities) are not apply units; `/opsx:apply` still implements every remaining task in a change. Splitting specs inside the same change does not change that. The new workflow is in the `core` profile.

### Bug Fixes

- **Apply named-spec overreach** — `/opsx:apply` no longer treats a spec or capability name as "apply the parent change." If the user asked for one slice, apply stops and suggests `/opsx:split` instead of implementing everything.
