import { randomUUID } from 'node:crypto';

import type { RunEvent } from '../domain/types.js';
import type { JsonStore } from '../storage/json-store.js';

export class EventService {
  public constructor(private readonly store: JsonStore) {}

  public async emit(
    runId: string,
    type: string,
    message: string,
    options: {
      nodeId?: string;
      data?: Record<string, unknown>;
    } = {},
  ): Promise<RunEvent> {
    const event: RunEvent = {
      id: randomUUID(),
      runId,
      type,
      timestamp: new Date().toISOString(),
      message,
      ...(options.nodeId === undefined ? {} : { nodeId: options.nodeId }),
      ...(options.data === undefined ? {} : { data: options.data }),
    };

    await this.store.mutate((state) => {
      state.events.push(event);
    });
    return event;
  }

  public list(runId?: string): Promise<RunEvent[]> {
    return this.store.read((state) =>
      state.events
        .filter((event) => runId === undefined || event.runId === runId)
        .sort((left, right) => left.timestamp.localeCompare(right.timestamp)),
    );
  }
}
