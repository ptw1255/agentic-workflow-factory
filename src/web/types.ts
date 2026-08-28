export type ViewId = 'studio' | 'runs' | 'connections' | 'proposals' | 'factory';
export type WorkflowStatus = 'draft' | 'deployed';
export type RunStatus =
  | 'queued'
  | 'running'
  | 'waiting'
  | 'succeeded'
  | 'failed'
  | 'cancelled';
export type ConnectionStatus = 'healthy' | 'degraded' | 'expired';

export interface Position {
  x: number;
  y: number;
}

export interface WorkflowNode {
  id: string;
  type: string;
  label: string;
  position: Position;
  config: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  condition?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: number;
  status: WorkflowStatus;
  trigger: { type: string };
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: string;
  updatedAt: string;
}

export interface ValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  nodeId?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface RunRecord {
  id: string;
  workflowId: string;
  workflowName: string;
  workflowVersion: number;
  status: RunStatus;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  costUsd: number;
  humanTouchpoints: number;
  error?: string;
}

export interface RunEvent {
  id: string;
  runId: string;
  nodeId?: string;
  type: string;
  timestamp: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface ConnectionRecord {
  id: string;
  name: string;
  connector: string;
  environment: string;
  status: ConnectionStatus;
  scopes: string[];
  lastCheckedAt: string;
  usageCount: number;
}

export interface AgentProposal {
  id: string;
  summary: string;
  rationale: string[] | string;
  workflow: WorkflowDefinition;
  issues: ValidationIssue[];
}

export interface NodeCatalogItem {
  type: string;
  label: string;
  category: string;
  description: string;
  defaultConfig: Record<string, unknown>;
}

export interface StageMetric {
  stage: string;
  runs: number;
  successRate: number;
  averageDurationMs: number;
}

export interface FactoryMetrics {
  throughput: number;
  costPerRun: number;
  automationPercent: number;
  humanTouchpoints: number;
  successRate: number;
  stageMetrics: StageMetric[];
}

export interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  nodeType: string;
  category: string;
  description: string;
  config: Record<string, unknown>;
}

