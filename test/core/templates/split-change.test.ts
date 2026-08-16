import { describe, expect, it } from 'vitest';

import {
  getSplitChangeInstructions,
  getSplitChangeSkillTemplate,
  getOpsxSplitCommandTemplate,
} from '../../../src/core/templates/skill-templates.js';
import { STORE_SELECTION_GUIDANCE } from '../../../src/core/templates/workflows/store-selection.js';

const skill = getSplitChangeSkillTemplate();
const command = getOpsxSplitCommandTemplate();

const bodies: Array<[string, string]> = [
  ['skill', skill.instructions],
  ['command', command.content],
  ['shared', getSplitChangeInstructions()],
];

describe('split-change templates', () => {
  it('generates the expected skill and command shape', () => {
    expect(skill.name).toBe('openspec-split-change');
    expect(skill.description).toContain('independently applyable');
    expect(skill.description).toContain('sub-specs');
    expect(skill.license).toBe('MIT');
    expect(skill.compatibility).toBe('Requires openspec CLI.');
    expect(skill.metadata).toEqual({ author: 'openspec', version: '1.0' });

    expect(command.name).toBe('OPSX: Split');
    expect(command.category).toBe('Workflow');
    expect(command.tags).toEqual(['workflow', 'artifacts', 'experimental']);
    expect(command.content).toContain('/opsx:split feat-user-account-deletion');
  });

  it('shares one instruction body across skill and command surfaces', () => {
    expect(skill.instructions).toBe(getSplitChangeInstructions());
    expect(command.content).toBe(getSplitChangeInstructions());
  });

  it('makes the planning-only boundary prominent', () => {
    for (const [label, body] of bodies) {
      const boundary = body.indexOf('**Planning boundary**');
      const steps = body.indexOf('**Steps**');
      expect(boundary, `${label} is missing its planning boundary`).toBeGreaterThanOrEqual(0);
      expect(boundary, `${label} boundary should appear before its steps`).toBeLessThan(steps);
      expect(body, label).toContain('Do not edit project code');
      expect(body, label).toContain('Do not start the apply workflow yourself');
    }
  });

  it('teaches change vs spec before any write steps', () => {
    for (const [label, body] of bodies) {
      const distinction = body.indexOf('**Change vs spec');
      const steps = body.indexOf('**Steps**');
      expect(distinction, label).toBeGreaterThanOrEqual(0);
      expect(distinction, `${label} should teach change vs spec before steps`).toBeLessThan(steps);
      expect(body, label).toContain('unit of implementation');
      expect(body, label).toContain('does **not** create independently applyable units');
      expect(body, label).toContain('split into sub-specs');
    }
  });

  it('creates child changes and retires the source without merging specs', () => {
    for (const [label, body] of bodies) {
      expect(body, label).toContain(STORE_SELECTION_GUIDANCE);
      expect(body, label).toContain('openspec list --json');
      expect(body, label).toContain('openspec status --change "<name>" --json');
      expect(body, label).toContain('openspec new change');
      expect(body, label).toContain('openspec validate "<child-name>"');
      expect(body, label).toContain('openspec archive "<source-name>" --skip-specs --yes');
      expect(body, label).toContain('Do not mkdir/mv/rm the change directory');
      expect(body, label).toContain('Do not sync specs first');
      expect(body, label).toContain('NEVER copy the entire source into every child');
      expect(body, label).toContain('NEVER only split spec files inside the source change');
    }
  });

  it('confirms the slice plan before writing and never starts apply', () => {
    for (const [label, body] of bodies) {
      expect(body, label).toContain('wait for the user to confirm before writing anything');
      expect(body, label).toContain('NEVER start `/opsx:apply` from this workflow');
      expect(body, label).toContain('Apply the first slice with `/opsx:apply <child-a>`');
    }
  });
});
