import { describe, expect, it } from 'vitest';

import {
  getApplyInstructions,
  getApplyChangeSkillTemplate,
  getOpsxApplyCommandTemplate,
} from '../../../src/core/templates/workflows/apply-change.js';

describe('apply implements a change, not a spec', () => {
  const instructions = getApplyInstructions();

  it('tells the agent not to implement a parent change when the user named a spec or slice', () => {
    expect(instructions).toContain('Change, not spec');
    expect(instructions).toContain('Specs/capabilities are not independently applyable');
    expect(instructions).toContain('do **not** resolve the name to a parent change and implement everything');
    expect(instructions).toContain('suggest `/opsx:split`');
  });

  it('repeats the change-vs-spec rule in the guardrails', () => {
    expect(instructions).toContain(
      'if the user named a capability or asked for one slice, stop and suggest `/opsx:split`'
    );
  });

  it('carries the same guidance on both the skill and command surfaces', () => {
    const needle = 'do **not** resolve the name to a parent change and implement everything';
    expect(getApplyChangeSkillTemplate().instructions).toContain(needle);
    expect(getOpsxApplyCommandTemplate().content).toContain(needle);
  });
});
