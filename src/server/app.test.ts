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
});
