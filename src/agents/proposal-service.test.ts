import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { seedWorkflow } from '../domain/seed.js';
import { JsonStore } from '../storage/json-store.js';
import { ProposalService } from './proposal-service.js';

describe('ProposalService', () => {
  it('creates a valid bounded proposal from a goal', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'factory-agent-'));
    const store = new JsonStore(path.join(directory, 'state.json'));
    const service = new ProposalService(store);

    const proposal = await service.create(
      seedWorkflow,
      'Receive a webhook, analyze the request with an agent, request human approval, and notify operations.',
    );

    expect(proposal.workflow.nodes.map((node) => node.type)).toEqual([
      'webhookTrigger',
      'approval',
      'agentLoop',
      'notification',
      'output',
    ]);
    expect(proposal.issues.filter((issue) => issue.level === 'error')).toHaveLength(0);
  });
});
