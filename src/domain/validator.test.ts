import { describe, expect, it } from 'vitest';

import { seedWorkflow } from './seed.js';
import { validateWorkflow } from './validator.js';

describe('validateWorkflow', () => {
  it('accepts the seeded workflow', () => {
    expect(validateWorkflow(seedWorkflow)).toEqual({
      valid: true,
      issues: [],
    });
  });

  it('rejects unbounded agent loops', () => {
    const workflow = structuredClone(seedWorkflow);
    const agent = workflow.nodes.find((node) => node.type === 'agentLoop');
    if (agent === undefined) {
      throw new Error('Seed workflow is missing its agent node.');
    }
    agent.config.maxIterations = 0;

    const result = validateWorkflow(workflow);

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'agent.budget', nodeId: agent.id }),
    );
  });

  it('rejects graph cycles', () => {
    const workflow = structuredClone(seedWorkflow);
    workflow.edges.push({
      id: 'cycle',
      source: 'output',
      target: 'prepare',
    });

    const result = validateWorkflow(workflow);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'graph.cycle')).toBe(true);
  });
});
