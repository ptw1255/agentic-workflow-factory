import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { JsonStore } from './json-store.js';
import type { RunEvent } from '../domain/types.js';

describe('JsonStore', () => {
  it('seeds and persists state atomically', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'factory-store-'));
    const file = path.join(directory, 'state.json');
    const store = new JsonStore(file);

    const workflowCount = await store.read((state) => state.workflows.length);
    await store.mutate((state) => {
      state.connections[0]!.usageCount += 1;
    });

    expect(workflowCount).toBe(1);
    const persisted = JSON.parse(await readFile(file, 'utf8')) as {
      connections: Array<{ usageCount: number }>;
    };
    expect(persisted.connections[0]?.usageCount).toBe(1);
  });

  it('serializes concurrent cold reads and mutations', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'factory-store-'));
    const file = path.join(directory, 'state.json');
    const store = new JsonStore(file);

    await Promise.all([
      ...Array.from({ length: 10 }, () =>
        store.read((state) => state.workflows.length),
      ),
      ...Array.from({ length: 10 }, () =>
        store.mutate((state) => {
          state.connections[0]!.usageCount += 1;
        }),
      ),
    ]);

    const usageCount = await store.read(
      (state) => state.connections[0]?.usageCount,
    );
    expect(usageCount).toBe(10);
  });

  it('migrates state files that predate workflow version history', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'factory-store-'));
    const file = path.join(directory, 'state.json');
    const state = {
      workflows: [{ id: 'workflow-1', version: 3 }],
      runs: [],
      events: [],
      connections: [],
      proposals: [],
    };
    await writeFile(file, JSON.stringify(state), 'utf8');

    const store = new JsonStore(file);
    const versions = await store.read((loaded) => loaded.workflowVersions);

    expect(versions).toEqual([{
      id: 'workflow-1',
      version: 3,
      agents: [],
      tenantId: 'tenant-local',
      projectId: 'project-local',
    }]);
  });

  it('supports the shared observability persistence contract', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'factory-store-'));
    const store = new JsonStore(path.join(directory, 'state.json'));
    const event: RunEvent = {
      id: '11111111-1111-4111-8111-111111111111',
      runId: 'run-1',
      type: 'run.started',
      timestamp: new Date().toISOString(),
      message: 'started',
      signal: 'log',
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef',
    };

    await store.appendEvent(event);

    expect(await store.listEvents('run-1')).toEqual([event]);
  });
});
