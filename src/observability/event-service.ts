import { randomUUID } from 'node:crypto';

import type { AgentSpanKind, RunEvent } from '../domain/types.js';
import type { PlatformStore } from '../storage/store.js';
import type { TelemetryExporter } from './otlp-exporter.js';
import { telemetryResource } from './semconv.js';

export class EventService {
  private readonly retentionHours: number;

  public constructor(
    private readonly store: PlatformStore,
    options: { retentionHours?: number; exporter?: TelemetryExporter } = {},
  ) {
    this.retentionHours = options.retentionHours ?? 48;
    this.exporter = options.exporter;
  }

  private readonly exporter: TelemetryExporter | undefined;

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
    if (this.exporter !== undefined) {
      void this.exporter.export(event);
    }
    return event;
  }

  public list(runId?: string): Promise<RunEvent[]> {
    return this.store.listEvents(runId);
  }

  public prune(): Promise<number> {
    if (this.store.pruneEvents === undefined) return Promise.resolve(0);
    const before = new Date(Date.now() - this.retentionHours * 60 * 60 * 1000).toISOString();
    return this.store.listEvents().then(async (events) => {
      const traceIds = [...new Set(events
        .filter((event) => event.timestamp < before)
        .map((event) => event.traceId))];
      const deleted = await this.store.pruneEvents!(before);
      await this.exporter?.prune?.(traceIds);
      return deleted;
    });
  }

  public close(): Promise<void> {
    return this.exporter?.close?.() ?? Promise.resolve();
  }
}
