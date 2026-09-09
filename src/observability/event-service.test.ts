import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { RunEvent } from '../domain/types.js';
import { JsonStore } from '../storage/json-store.js';
import { EventService } from './event-service.js';

function event(id: string, timestamp: string, traceId: string): RunEvent {
  return {
    id,
    runId: 'run-1',
    type: 'run.started',
    timestamp,
    message: 'started',
    signal: 'trace',
    traceId,
    spanId: id.replaceAll('-', '').slice(0, 16),
  };
}

describe('EventService retention', () => {
  it('removes events older than the configured window', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'factory-events-'));
    const store = new JsonStore(path.join(directory, 'state.json'));
    const service = new EventService(store, { retentionHours: 48 });
    const now = Date.now();

    await store.appendEvent(event(
      '11111111-1111-4111-8111-111111111111',
      new Date(now - 49 * 60 * 60 * 1000).toISOString(),
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    ));
    await store.appendEvent(event(
      '22222222-2222-4222-8222-222222222222',
      new Date(now - 1 * 60 * 60 * 1000).toISOString(),
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    ));

    expect(await service.prune()).toBe(1);
    expect((await service.list()).map((item) => item.traceId)).toEqual([
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    ]);
  });
});
