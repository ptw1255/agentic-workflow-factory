import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from './app.js';

describe('platform API', () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'factory-api-'));
    app = await createApp({
      dataFile: path.join(directory, 'state.json'),
      serveStatic: false,
      secretBroker: {
        put: async () => undefined,
        get: async () => 'test-secret',
      },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('exposes the catalog, workflows, connections, and metrics', async () => {
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    const catalog = await app.inject({
      method: 'GET',
      url: '/api/catalog/nodes',
    });
    const workflows = await app.inject({
      method: 'GET',
      url: '/api/workflows',
    });
    const metrics = await app.inject({
      method: 'GET',
      url: '/api/factory/metrics',
    });

    expect(health.statusCode).toBe(200);
    expect(catalog.json<{ items: unknown[] }>().items.length).toBeGreaterThan(5);
    expect(workflows.json<{ items: unknown[] }>().items).toHaveLength(1);
    expect(metrics.json()).toEqual(
      expect.objectContaining({
        automationPercent: 100,
        stageMetrics: expect.any(Array),
      }),
    );
  });

  it('creates projects and scopes workflow reads by project header', async () => {
    const createProject = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { 'x-tenant-id': 'tenant-local' },
      payload: { name: 'Second loop', description: 'Independent workflow project' },
    });
    expect(createProject.statusCode).toBe(200);
    const projectId = createProject.json<{ id: string }>().id;

    const defaultWorkflows = await app.inject({ method: 'GET', url: '/api/workflows' });
    const secondWorkflows = await app.inject({
      method: 'GET',
      url: '/api/workflows',
      headers: { 'x-project-id': projectId },
    });
    expect(defaultWorkflows.json<{ items: unknown[] }>().items).toHaveLength(1);
    expect(secondWorkflows.json<{ items: unknown[] }>().items).toHaveLength(0);

    const clone = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/workflows`,
      headers: { 'x-project-id': 'project-local', 'x-tenant-id': 'tenant-local' },
      payload: { sourceWorkflowId: 'workflow-agent-intake', name: 'Second loop workflow' },
    });
    expect(clone.statusCode).toBe(200);
    const scopedAfterClone = await app.inject({
      method: 'GET',
      url: '/api/workflows',
      headers: { 'x-project-id': projectId, 'x-tenant-id': 'tenant-local' },
    });
    expect(scopedAfterClone.json<{ items: Array<{ projectId: string }> }>().items).toEqual([
      expect.objectContaining({ projectId }),
    ]);

    const tenantResponse = await app.inject({
      method: 'POST',
      url: '/api/tenants',
      payload: { name: 'Other tenant' },
    });
    const otherTenantId = tenantResponse.json<{ id: string }>().id;
    const otherProjectResponse = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { 'x-tenant-id': otherTenantId },
      payload: { name: 'Other loop' },
    });
    expect(otherProjectResponse.statusCode).toBe(200);
    const crossTenantRead = await app.inject({
      method: 'GET',
      url: '/api/workflows',
      headers: { 'x-tenant-id': otherTenantId, 'x-project-id': projectId },
    });
    expect(crossTenantRead.json<{ items: unknown[] }>().items).toHaveLength(0);
  });

  it('creates a managed connection without accepting credentials', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: {
        name: 'Telemetry',
        connector: 'OpenTelemetry',
        environment: 'development',
        scopes: ['traces:write'],
        secret: 'must-not-be-persisted',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).not.toHaveProperty('secret');
  });

  it('preserves immutable workflow versions after a save', async () => {
    const currentResponse = await app.inject({
      method: 'GET',
      url: '/api/workflows/workflow-agent-intake',
    });
    const current = currentResponse.json<Record<string, unknown>>();
    const updated = { ...current, name: 'Updated request intake' };

    const saveResponse = await app.inject({
      method: 'PUT',
      url: '/api/workflows/workflow-agent-intake',
      payload: updated,
    });
    expect(saveResponse.statusCode).toBe(200);
    expect(saveResponse.json()).toMatchObject({ version: 2, name: 'Updated request intake' });

    const versionsResponse = await app.inject({
      method: 'GET',
      url: '/api/workflows/workflow-agent-intake/versions',
    });
    expect(versionsResponse.statusCode).toBe(200);
    expect(versionsResponse.json<{ items: Array<{ version: number }> }>().items.map(
      (version) => version.version,
    )).toEqual([2, 1]);

    const originalResponse = await app.inject({
      method: 'GET',
      url: '/api/workflows/workflow-agent-intake/versions/1',
    });
    expect(originalResponse.json()).toMatchObject({
      version: 1,
      name: 'Agent-led request intake',
    });
  });

  it('exposes telemetry through log, trace, and metric signals', async () => {
    const start = await app.inject({
      method: 'POST',
      url: '/api/workflows/workflow-agent-intake/runs',
      payload: {},
    });
    const runId = start.json<{ id: string }>().id;
    await new Promise((resolve) => setTimeout(resolve, 30));

    const telemetry = await app.inject({
      method: 'GET',
      url: `/api/telemetry?runId=${runId}`,
    });
    const payload = telemetry.json<{ items: Array<{ signal: string }>; resource: Record<string, string> }>();
    expect(telemetry.statusCode).toBe(200);
    expect(payload.resource['telemetry.sdk.name']).toBe('opentelemetry');
    expect(new Set(payload.items.map((item) => item.signal))).toEqual(
      new Set(['log', 'trace', 'metric']),
    );
  });
});
