import { z } from 'zod';

const agentRoleSchema = z.object({
  id: z.string().min(1),
  purpose: z.string().min(1),
  tools: z.array(z.string()),
  maxIterations: z.number().int().min(1).max(25),
  maxCostUsd: z.number().nonnegative(),
  requiresApproval: z.boolean(),
});

export const factoryManifestSchema = z.object({
  schemaVersion: z.literal('1'),
  id: z.string().min(1),
  name: z.string().min(1),
  execution: z.object({
    runtime: z.literal('temporal'),
    apiFirst: z.literal(true),
    taskQueue: z.string().min(1),
  }),
  workflowIds: z.array(z.string()).min(1),
  agentRoles: z.array(agentRoleSchema),
  scorers: z.array(
    z.object({
      id: z.string().min(1),
      dimension: z.string().min(1),
      samplePercent: z.number().min(0).max(100),
    }),
  ),
  promotion: z.object({
    protectedEnvironments: z.array(z.string()),
    requireHumanApproval: z.boolean(),
    requireBenchmarkEvidence: z.boolean(),
  }),
});

export type FactoryManifest = z.infer<typeof factoryManifestSchema>;

export const defaultFactoryManifest: FactoryManifest = {
  schemaVersion: '1',
  id: 'agentic-workflow-factory',
  name: 'Agentic Workflow Factory',
  execution: {
    runtime: 'temporal',
    apiFirst: true,
    taskQueue: 'agentic-workflows',
  },
  workflowIds: ['workflow-agent-intake'],
  agentRoles: [
    {
      id: 'builder',
      purpose: 'Propose typed workflow changes from bounded product outcomes.',
      tools: ['workflow.read', 'workflow.propose', 'workflow.validate'],
      maxIterations: 8,
      maxCostUsd: 1,
      requiresApproval: true,
    },
    {
      id: 'reviewer',
      purpose: 'Evaluate proposals for correctness, safety, cost, and operability.',
      tools: ['workflow.read', 'run.read', 'evidence.read'],
      maxIterations: 4,
      maxCostUsd: 0.5,
      requiresApproval: false,
    },
  ],
  scorers: [
    { id: 'correctness', dimension: 'correctness', samplePercent: 100 },
    { id: 'cost-efficiency', dimension: 'cost', samplePercent: 100 },
    { id: 'human-burden', dimension: 'automation', samplePercent: 100 },
  ],
  promotion: {
    protectedEnvironments: ['production'],
    requireHumanApproval: true,
    requireBenchmarkEvidence: true,
  },
};
