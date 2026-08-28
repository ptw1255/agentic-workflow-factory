import { randomUUID } from 'node:crypto';

import { nodeCatalog } from '../domain/catalog.js';
import type {
  AgentProposal,
  WorkflowDefinition,
  WorkflowNode,
} from '../domain/types.js';
import { validateWorkflow } from '../domain/validator.js';
import type { JsonStore } from '../storage/json-store.js';

interface PlannedNode {
  type: string;
  reason: string;
}

const keywordPlans: Array<{
  pattern: RegExp;
  node: PlannedNode;
}> = [
  {
    pattern: /\b(webhook|event|incoming|receive)\b/i,
    node: { type: 'webhookTrigger', reason: 'The goal describes event-driven intake.' },
  },
  {
    pattern: /\b(schedule|daily|weekly|cron)\b/i,
    node: { type: 'scheduleTrigger', reason: 'The goal describes scheduled work.' },
  },
  {
    pattern: /\b(fetch|http|api|endpoint)\b/i,
    node: { type: 'httpRequest', reason: 'The goal requires an external API call.' },
  },
  {
    pattern: /\b(approve|approval|review|human)\b/i,
    node: { type: 'approval', reason: 'The goal requests a human decision boundary.' },
  },
  {
    pattern: /\b(agent|reason|investigate|analy[sz]e|plan)\b/i,
    node: { type: 'agentLoop', reason: 'The goal benefits from bounded agent reasoning.' },
  },
  {
    pattern: /\b(notify|message|alert|email)\b/i,
    node: { type: 'notification', reason: 'The goal includes an operator notification.' },
  },
];

function makeNode(type: string, index: number): WorkflowNode {
  const catalogItem = nodeCatalog.find((item) => item.type === type);
  if (catalogItem === undefined) {
    throw new Error(`Cannot plan unknown node type "${type}".`);
  }
  return {
    id: `${type}-${randomUUID().slice(0, 8)}`,
    type,
    label: catalogItem.label,
    position: { x: 60 + index * 260, y: 180 },
    config: structuredClone(catalogItem.defaultConfig),
  };
}

function selectPlan(goal: string): PlannedNode[] {
  const selected = keywordPlans
    .filter((candidate) => candidate.pattern.test(goal))
    .map((candidate) => candidate.node);

  const trigger = selected.find((candidate) =>
    ['webhookTrigger', 'scheduleTrigger'].includes(candidate.type),
  ) ?? {
    type: 'manualTrigger',
    reason: 'A manual trigger keeps the first proposal safe and reviewable.',
  };
  const operations = selected.filter(
    (candidate) =>
      !['webhookTrigger', 'scheduleTrigger', 'manualTrigger'].includes(
        candidate.type,
      ),
  );

  if (!operations.some((candidate) => candidate.type === 'agentLoop')) {
    operations.unshift({
      type: 'transform',
      reason: 'Normalize inputs before side effects or final output.',
    });
  }
  return [
    trigger,
    ...operations,
    {
      type: 'output',
      reason: 'Every proposal declares an observable terminal result.',
    },
  ];
}

export class ProposalService {
  public constructor(private readonly store: JsonStore) {}

  public async create(
    workflow: WorkflowDefinition,
    goal: string,
  ): Promise<AgentProposal> {
    const selected = selectPlan(goal);
    const now = new Date().toISOString();
    const nodes = selected.map((item, index) => makeNode(item.type, index));
    const proposed: WorkflowDefinition = {
      ...structuredClone(workflow),
      id: workflow.id,
      name: `${workflow.name} proposal`,
      description: goal,
      version: workflow.version + 1,
      status: 'draft',
      trigger: { type: nodes[0]?.type ?? 'manualTrigger' },
      nodes,
      edges: nodes.slice(0, -1).map((node, index) => ({
        id: `edge-${node.id}-${nodes[index + 1]?.id ?? 'output'}`,
        source: node.id,
        target: nodes[index + 1]?.id ?? node.id,
      })),
      updatedAt: now,
    };
    const validation = validateWorkflow(proposed);
    const proposal: AgentProposal = {
      id: randomUUID(),
      workflowId: workflow.id,
      goal,
      summary: `Proposed ${nodes.length} nodes for: ${goal}`,
      rationale: selected.map((item) => item.reason),
      workflow: proposed,
      issues: validation.issues,
      createdAt: now,
    };
    await this.store.mutate((state) => {
      state.proposals.unshift(proposal);
    });
    return proposal;
  }
}
