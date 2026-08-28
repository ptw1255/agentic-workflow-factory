import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { JsonStore } from './json-store.js';

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
});
