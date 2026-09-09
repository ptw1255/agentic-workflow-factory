import type { PlatformState, RunEvent } from '../domain/types.js';
import { defaultWorkUnit } from '../domain/catalog.js';

export type StateMutation<T> = (state: PlatformState) => T | Promise<T>;

/** Storage contract shared by the JSON development adapter and PostgreSQL. */
export interface PlatformStore {
  read<T>(select: (state: PlatformState) => T): Promise<T>;
  mutate<T>(mutation: StateMutation<T>): Promise<T>;
  appendEvent(event: RunEvent): Promise<void>;
  listEvents(runId?: string): Promise<RunEvent[]>;
  /** Remove observability records older than the configured retention window. */
  pruneEvents?(before: string): Promise<number>;
  close?(): Promise<void>;
}

export function normalizePlatformState(state: PlatformState): PlatformState {
  state.workflowVersions ??= structuredClone(state.workflows);
  for (const workflow of [...state.workflows, ...state.workflowVersions]) {
    workflow.agents ??= [];
    for (const node of workflow.nodes ?? []) {
      node.unit ??= defaultWorkUnit(node.type);
    }
  }
  for (const connection of state.connections) {
    connection.secretConfigured ??= connection.secretRef !== undefined;
  }
  for (const run of state.runs) {
    run.unitOutputs ??= {};
  }
  return state;
}
