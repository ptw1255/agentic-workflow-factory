import type {
  AgentProposal,
  ConnectionRecord,
  FactoryMetrics,
  NodeCatalogItem,
  RunEvent,
  RunRecord,
  ValidationResult,
  WorkflowDefinition,
} from './types';

interface ItemsResponse<T> {
  items: T[];
}

interface ErrorPayload {
  message?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload as ErrorPayload | null;
    throw new Error(error?.message ?? `Request failed with status ${response.status}.`);
  }
  return payload as T;
}

export const api = {
  catalog: () => request<ItemsResponse<NodeCatalogItem>>('/api/catalog/nodes'),
  workflows: () => request<ItemsResponse<WorkflowDefinition>>('/api/workflows'),
  workflow: (id: string) =>
    request<WorkflowDefinition>(`/api/workflows/${encodeURIComponent(id)}`),
  saveWorkflow: (workflow: WorkflowDefinition) =>
    request<WorkflowDefinition>(`/api/workflows/${encodeURIComponent(workflow.id)}`, {
      method: 'PUT',
      body: JSON.stringify(workflow),
    }),
  validateWorkflow: (id: string) =>
    request<ValidationResult>(`/api/workflows/${encodeURIComponent(id)}/validate`, {
      method: 'POST',
      body: '{}',
    }),
  startRun: (id: string) =>
    request<RunRecord>(`/api/workflows/${encodeURIComponent(id)}/runs`, {
      method: 'POST',
      body: '{}',
    }),
  runs: () => request<ItemsResponse<RunRecord>>('/api/runs'),
  run: (id: string) => request<RunRecord>(`/api/runs/${encodeURIComponent(id)}`),
  approveRun: (id: string) =>
    request<RunRecord>(`/api/runs/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: '{}',
    }),
  cancelRun: (id: string) =>
    request<RunRecord>(`/api/runs/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: '{}',
    }),
  events: (runId: string) =>
    request<ItemsResponse<RunEvent>>(`/api/events?runId=${encodeURIComponent(runId)}`),
  connections: () => request<ItemsResponse<ConnectionRecord>>('/api/connections'),
  createConnection: (input: {
    name: string;
    connector: string;
    environment: string;
    scopes: string[];
  }) =>
    request<ConnectionRecord>('/api/connections', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  createProposal: (goal: string, workflowId: string) =>
    request<AgentProposal>('/api/agent/proposals', {
      method: 'POST',
      body: JSON.stringify({ goal, workflowId }),
    }),
  factoryMetrics: () => request<FactoryMetrics>('/api/factory/metrics'),
};
