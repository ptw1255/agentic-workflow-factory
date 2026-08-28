import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { seedWorkflow } from '../domain/seed.js';
import { EventService } from '../observability/event-service.js';
import { JsonStore } from '../storage/json-store.js';
import { LocalWorkflowExecutor } from './executor.js';

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for executor state.');
}

describe('LocalWorkflowExecutor', () => {
  let store: JsonStore;
  let events: EventService;
  let executor: LocalWorkflowExecutor;

  beforeEach(async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'factory-runtime-'));
    store = new JsonStore(path.join(directory, 'state.json'));
    events = new EventService(store);
    executor = new LocalWorkflowExecutor(store, events);
  });

  it('executes the seeded workflow and records correlated events', async () => {
    const run = await executor.start(seedWorkflow);
    await waitFor(async () => {
      const current = await store.read((state) =>
        state.runs.find((candidate) => candidate.id === run.id),
      );
      return current?.status === 'succeeded';
    });

    const completed = await store.read((state) =>
      state.runs.find((candidate) => candidate.id === run.id),
    );
    const recorded = await events.list(run.id);

    expect(completed?.completedNodeIds).toHaveLength(seedWorkflow.nodes.length);
    expect(completed?.costUsd).toBeGreaterThan(0);
    expect(recorded.some((event) => event.type === 'run.succeeded')).toBe(true);
    expect(
      recorded.filter((event) => event.type === 'agent.iteration'),
    ).toHaveLength(3);
  });

  it('waits for and resumes from a human approval', async () => {
    const workflow = structuredClone(seedWorkflow);
    const output = workflow.nodes.find((node) => node.id === 'output');
    if (output === undefined) {
      throw new Error('Seed output node is missing.');
    }
    workflow.nodes.splice(workflow.nodes.indexOf(output), 0, {
      id: 'approval',
      type: 'approval',
      label: 'Approve output',
      position: { x: 1_020, y: 180 },
      config: {},
    });
    const incoming = workflow.edges.find((edge) => edge.target === 'output');
    if (incoming === undefined) {
      throw new Error('Seed output edge is missing.');
    }
    incoming.target = 'approval';
    workflow.edges.push({
      id: 'approval-output',
      source: 'approval',
      target: 'output',
    });

    const run = await executor.start(workflow);
    await waitFor(async () => {
      const current = await store.read((state) =>
        state.runs.find((candidate) => candidate.id === run.id),
      );
      return current?.status === 'waiting';
    });
    await executor.approve(run.id);
    await waitFor(async () => {
      const current = await store.read((state) =>
        state.runs.find((candidate) => candidate.id === run.id),
      );
      return current?.status === 'succeeded';
    });

    const completed = await store.read((state) =>
      state.runs.find((candidate) => candidate.id === run.id),
    );
    expect(completed?.humanTouchpoints).toBe(1);
    expect(completed?.completedNodeIds).toContain('approval');
  });

  it('does not execute nodes unreachable from the declared trigger', async () => {
    const workflow = structuredClone(seedWorkflow);
    workflow.nodes.push({
      id: 'isolated-notification',
      type: 'notification',
      label: 'Must not execute',
      position: { x: 0, y: 0 },
      config: { message: 'unreachable' },
    });

    const run = await executor.start(workflow);
    await waitFor(async () => {
      const current = await store.read((state) =>
        state.runs.find((candidate) => candidate.id === run.id),
      );
      return current?.status === 'succeeded';
    });

    const completed = await store.read((state) =>
      state.runs.find((candidate) => candidate.id === run.id),
    );
    expect(completed?.completedNodeIds).not.toContain('isolated-notification');
  });

  it('aborts active work and preserves cancellation as terminal', async () => {
    const workflow = structuredClone(seedWorkflow);
    const agent = workflow.nodes.find((node) => node.id === 'agent');
    if (agent === undefined) {
      throw new Error('Seed agent node is missing.');
    }
    agent.type = 'wait';
    agent.label = 'Long wait';
    agent.config = { durationMs: 1_000 };

    const run = await executor.start(workflow);
    await waitFor(async () =>
      (await events.list(run.id)).some(
        (event) => event.type === 'node.started' && event.nodeId === 'agent',
      ),
    );
    await executor.cancel(run.id);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const cancelled = await store.read((state) =>
      state.runs.find((candidate) => candidate.id === run.id),
    );
    const recorded = await events.list(run.id);
    expect(cancelled?.status).toBe('cancelled');
    expect(cancelled?.completedNodeIds).not.toContain('agent');
    expect(recorded.some((event) => event.type === 'run.succeeded')).toBe(false);
    expect(recorded.some((event) => event.type === 'run.failed')).toBe(false);
  });

  it('recovers persisted queued and running executions', async () => {
    const runId = 'recoverable-run';
    await store.mutate((state) => {
      state.runs.push({
        id: runId,
        workflowId: seedWorkflow.id,
        workflowName: seedWorkflow.name,
        workflowVersion: seedWorkflow.version,
        status: 'running',
        startedAt: new Date().toISOString(),
        costUsd: 0,
        humanTouchpoints: 0,
        workflowDefinition: structuredClone(seedWorkflow),
        completedNodeIds: [],
        activatedNodeIds: ['trigger'],
        approvedNodeIds: [],
      });
    });

    expect(await executor.recover()).toBe(1);
    await waitFor(async () => {
      const current = await store.read((state) =>
        state.runs.find((candidate) => candidate.id === runId),
      );
      return current?.status === 'succeeded';
    });

    expect(
      (await events.list(runId)).some((event) => event.type === 'run.recovered'),
    ).toBe(true);
  });
});
