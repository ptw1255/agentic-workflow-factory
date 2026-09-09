import { randomUUID } from 'node:crypto';

import type { AgentSpanKind, RunEvent } from '../domain/types.js';
import type { PlatformStore } from '../storage/store.js';
import { telemetryResource } from './semconv.js';

export class EventService {
  public constructor(private readonly store: PlatformStore) {}

  public async emit(
    runId: string,
    type: string,
    message: string,
    options: {
      nodeId?: string;
      data?: Record<string, unknown>;
      signal?: 'log' | 'trace' | 'metric';
      spanKind?: AgentSpanKind;
      parentSpanId?: string;
      severityText?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
      attributes?: Record<string, string | number | boolean>;
    } = {},
  ): Promise<RunEvent> {
    const traceId = await this.store.read((state) =>
      state.runs.find((run) => run.id === runId)?.traceId,
    );
    const event: RunEvent = {
      id: randomUUID(),
      runId,
      type,
      timestamp: new Date().toISOString(),
      message,
      signal: options.signal ?? 'log',
      traceId: traceId ?? runId.replaceAll('-', '').padEnd(32, '0').slice(0, 32),
      spanId: randomUUID().replaceAll('-', '').slice(0, 16),
      ...(options.nodeId === undefined ? {} : { nodeId: options.nodeId }),
      ...(options.data === undefined ? {} : { data: options.data }),
      ...(options.parentSpanId === undefined ? {} : { parentSpanId: options.parentSpanId }),
      ...(options.spanKind === undefined ? {} : { spanKind: options.spanKind }),
      ...(options.severityText === undefined ? {} : { severityText: options.severityText }),
      attributes: { ...telemetryResource, ...(options.attributes ?? {}) },
    };

    await this.store.appendEvent(event);
    return event;
  }

  public list(runId?: string): Promise<RunEvent[]> {
    return this.store.listEvents(runId);
  }
}
