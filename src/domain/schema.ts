import { z } from 'zod';

const configSchema = z.record(z.string(), z.unknown());

export const workflowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  label: z.string().min(1),
  position: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  config: configSchema,
});

export const workflowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  condition: z.string().optional(),
});

export const workflowDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  version: z.number().int().positive(),
  status: z.enum(['draft', 'deployed']),
  trigger: z.object({
    type: z.string().min(1),
  }),
  nodes: z.array(workflowNodeSchema).min(1),
  edges: z.array(workflowEdgeSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const createConnectionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  connector: z.string().trim().min(1).max(100),
  environment: z.string().trim().min(1).max(50),
  scopes: z.array(z.string().trim().min(1)).max(25),
});

export const createProposalSchema = z.object({
  goal: z.string().trim().min(10).max(2_000),
  workflowId: z.string().min(1),
});
