import type { NodeCatalogItem } from './types.js';

export const nodeCatalog: NodeCatalogItem[] = [
  {
    type: 'manualTrigger',
    label: 'Manual trigger',
    category: 'Triggers',
    description: 'Start a run from the dashboard or API.',
    defaultConfig: {},
  },
  {
    type: 'scheduleTrigger',
    label: 'Schedule',
    category: 'Triggers',
    description: 'Start on a declared schedule.',
    defaultConfig: { cron: '0 9 * * 1-5' },
  },
  {
    type: 'webhookTrigger',
    label: 'Webhook',
    category: 'Triggers',
    description: 'Start when an authenticated webhook arrives.',
    defaultConfig: { path: '/events/new' },
  },
  {
    type: 'transform',
    label: 'Transform data',
    category: 'Data',
    description: 'Create a structured value for downstream nodes.',
    defaultConfig: { value: 'Prepared workflow context' },
  },
  {
    type: 'condition',
    label: 'Condition',
    category: 'Control',
    description: 'Select true or false outgoing edges.',
    defaultConfig: { result: true },
  },
  {
    type: 'wait',
    label: 'Wait',
    category: 'Control',
    description: 'Pause for a bounded interval.',
    defaultConfig: { durationMs: 250 },
  },
  {
    type: 'httpRequest',
    label: 'HTTP request',
    category: 'Connections',
    description: 'Call an HTTP endpoint with timeout and retry-safe semantics.',
    defaultConfig: { method: 'GET', url: '' },
  },
  {
    type: 'approval',
    label: 'Human approval',
    category: 'Human',
    description: 'Pause until an operator approves the run.',
    defaultConfig: { instructions: 'Review the proposed action.' },
  },
  {
    type: 'agentLoop',
    label: 'Bounded agent loop',
    category: 'Agent',
    description: 'Run a goal-oriented loop with explicit iteration and cost bounds.',
    defaultConfig: { goal: 'Evaluate the workflow outcome', maxIterations: 3 },
  },
  {
    type: 'notification',
    label: 'Notification',
    category: 'Operations',
    description: 'Emit a notification event for operators or integrations.',
    defaultConfig: { channel: 'operations', message: 'Workflow completed' },
  },
  {
    type: 'output',
    label: 'Output',
    category: 'Data',
    description: 'Declare the workflow result.',
    defaultConfig: { value: 'success' },
  },
];

export const knownNodeTypes = new Set(nodeCatalog.map((item) => item.type));
export const triggerNodeTypes = new Set([
  'manualTrigger',
  'scheduleTrigger',
  'webhookTrigger',
]);
