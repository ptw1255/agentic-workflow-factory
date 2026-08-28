import { describe, expect, it } from 'vitest';

import { executeNodeActivity } from './activities.js';

describe('executeNodeActivity', () => {
  it('uses the same condition result contract as the local executor', async () => {
    const result = await executeNodeActivity({
      runId: 'run',
      nodeId: 'condition',
      nodeType: 'condition',
      label: 'Condition',
      config: { result: false },
    });

    expect(result.result).toBe(false);
  });
});
