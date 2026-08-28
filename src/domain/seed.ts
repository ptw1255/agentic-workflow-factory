import type { ConnectionRecord, PlatformState, WorkflowDefinition } from './types.js';

const createdAt = '2026-08-28T15:00:00.000Z';

export const seedWorkflow: WorkflowDefinition = {
  id: 'workflow-agent-intake',
  name: 'Agent-led request intake',
  description:
    'Prepare a request, execute a bounded agent assessment, and notify operators.',
  version: 1,
  status: 'draft',
  trigger: { type: 'manualTrigger' },
  nodes: [
    {
      id: 'trigger',
      type: 'manualTrigger',
      label: 'Receive request',
      position: { x: 40, y: 180 },
      config: {},
    },
    {
      id: 'prepare',
      type: 'transform',
      label: 'Prepare context',
      position: { x: 300, y: 180 },
      config: { value: 'Validated product request' },
    },
    {
      id: 'agent',
      type: 'agentLoop',
      label: 'Assess request',
      position: { x: 560, y: 180 },
      config: {
        goal: 'Assess feasibility, risk, and the next best action',
        maxIterations: 3,
      },
    },
    {
      id: 'notify',
      type: 'notification',
      label: 'Notify operator',
      position: { x: 820, y: 180 },
      config: {
        channel: 'operations',
        message: 'Agent assessment completed',
      },
    },
    {
      id: 'output',
      type: 'output',
      label: 'Return outcome',
      position: { x: 1080, y: 180 },
      config: { value: 'ready-for-review' },
    },
  ],
  edges: [
    { id: 'e-trigger-prepare', source: 'trigger', target: 'prepare' },
    { id: 'e-prepare-agent', source: 'prepare', target: 'agent' },
    { id: 'e-agent-notify', source: 'agent', target: 'notify' },
    { id: 'e-notify-output', source: 'notify', target: 'output' },
  ],
  createdAt,
  updatedAt: createdAt,
};

const seedConnections: ConnectionRecord[] = [
  {
    id: 'connection-product-api',
    name: 'Product API',
    connector: 'HTTP',
    environment: 'development',
    status: 'healthy',
    scopes: ['api:read'],
    lastCheckedAt: createdAt,
    usageCount: 0,
  },
  {
    id: 'connection-source-control',
    name: 'Source control',
    connector: 'GitHub',
    environment: 'development',
    status: 'healthy',
    scopes: ['contents:read', 'pull_requests:write'],
    lastCheckedAt: createdAt,
    usageCount: 0,
  },
];

export function createSeedState(): PlatformState {
  return {
    workflows: [structuredClone(seedWorkflow)],
    runs: [],
    events: [],
    connections: structuredClone(seedConnections),
    proposals: [],
  };
}
