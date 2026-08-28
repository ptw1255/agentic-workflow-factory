import { randomUUID } from 'node:crypto';

import type {
  RunRecord,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
} from '../domain/types.js';
import { validateWorkflow } from '../domain/validator.js';
import type { EventService } from '../observability/event-service.js';
import type { JsonStore } from '../storage/json-store.js';

const MAX_WAIT_MS = 5_000;
const HTTP_TIMEOUT_MS = 10_000;

function sleep(durationMs: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, durationMs);
    const abort = (): void => {
      clearTimeout(timeout);
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

function edgeMatches(edge: WorkflowEdge, result: unknown): boolean {
  if (edge.condition === undefined || edge.condition.trim() === '') {
    return true;
  }
  return edge.condition.trim().toLowerCase() === String(result).toLowerCase();
}

export class LocalWorkflowExecutor {
  private readonly activeRuns = new Map<string, AbortController>();

  public constructor(
    private readonly store: JsonStore,
    private readonly events: EventService,
  ) {}

  public async recover(): Promise<number> {
    const runIds = await this.store.read((state) =>
      state.runs
        .filter((run) => ['queued', 'running'].includes(run.status))
        .map((run) => run.id),
    );
    for (const runId of runIds) {
      await this.events.emit(
        runId,
        'run.recovered',
        'Resuming run from its last persisted node checkpoint.',
      );
      void this.execute(runId);
    }
    return runIds.length;
  }

  public async start(workflow: WorkflowDefinition): Promise<RunRecord> {
    const validation = validateWorkflow(workflow);
    if (!validation.valid) {
      const message = validation.issues
        .filter((issue) => issue.level === 'error')
        .map((issue) => issue.message)
        .join(' ');
      throw new Error(`Workflow is not executable. ${message}`);
    }

    const now = new Date().toISOString();
    const trigger = workflow.nodes.find(
      (node) => node.type === workflow.trigger.type,
    );
    if (trigger === undefined) {
      throw new Error('The declared workflow trigger node is missing.');
    }
    const run: RunRecord = {
      id: randomUUID(),
      workflowId: workflow.id,
      workflowName: workflow.name,
      workflowVersion: workflow.version,
      status: 'queued',
      startedAt: now,
      costUsd: 0,
      humanTouchpoints: 0,
      workflowDefinition: structuredClone(workflow),
      completedNodeIds: [],
      activatedNodeIds: [trigger.id],
      approvedNodeIds: [],
    };

    await this.store.mutate((state) => {
      state.runs.unshift(run);
    });
    await this.events.emit(run.id, 'run.queued', 'Workflow run queued.');
    void this.execute(run.id);
    return run;
  }

  public async approve(runId: string): Promise<RunRecord> {
    const run = await this.store.mutate((state) => {
      const target = state.runs.find((candidate) => candidate.id === runId);
      if (target === undefined) {
        throw new Error('Run not found.');
      }
      if (target.status !== 'waiting') {
        throw new Error('Only waiting runs can be approved.');
      }
      const waitingNode = target.workflowDefinition.nodes.find(
        (node) =>
          node.type === 'approval' &&
          target.activatedNodeIds.includes(node.id) &&
          !target.completedNodeIds.includes(node.id),
      );
      if (waitingNode === undefined) {
        throw new Error('No approval node is waiting.');
      }
      target.approvedNodeIds.push(waitingNode.id);
      target.humanTouchpoints += 1;
      target.status = 'queued';
      return target;
    });

    await this.events.emit(runId, 'approval.received', 'Human approval received.');
    void this.execute(runId);
    return run;
  }

  public async cancel(runId: string): Promise<RunRecord> {
    const completedAt = new Date();
    const run = await this.store.mutate((state) => {
      const target = state.runs.find((candidate) => candidate.id === runId);
      if (target === undefined) {
        throw new Error('Run not found.');
      }
      if (['succeeded', 'failed', 'cancelled'].includes(target.status)) {
        throw new Error('Completed runs cannot be cancelled.');
      }
      target.status = 'cancelled';
      target.completedAt = completedAt.toISOString();
      target.durationMs =
        completedAt.getTime() - new Date(target.startedAt).getTime();
      return target;
    });
    this.activeRuns.get(runId)?.abort(
      new Error('Workflow run was cancelled by an operator.'),
    );
    await this.events.emit(runId, 'run.cancelled', 'Workflow run cancelled.');
    return run;
  }

  public async execute(runId: string): Promise<void> {
    if (this.activeRuns.has(runId)) {
      return;
    }
    const controller = new AbortController();
    this.activeRuns.set(runId, controller);

    try {
      const started = await this.transitionToRunning(runId);
      if (!started) {
        return;
      }
      await this.events.emit(runId, 'run.started', 'Workflow run started.');

      while (true) {
        const context = await this.store.read((state) => {
          const run = state.runs.find((candidate) => candidate.id === runId);
          const workflow = run?.workflowDefinition;
          return { run, workflow };
        });

        if (context.run === undefined || context.workflow === undefined) {
          throw new Error('Run or workflow definition no longer exists.');
        }
        if (context.run.status === 'cancelled') {
          return;
        }

        const nextNode = this.findReadyNode(context.workflow, context.run);
        if (nextNode === undefined) {
          const unfinished = context.run.activatedNodeIds.filter(
            (nodeId) => !context.run?.completedNodeIds.includes(nodeId),
          );
          if (unfinished.length > 0) {
            await this.waitForApproval(runId, unfinished[0] ?? '');
            return;
          }
          await this.completeRun(runId);
          return;
        }

        if (
          nextNode.type === 'approval' &&
          !context.run.approvedNodeIds.includes(nextNode.id)
        ) {
          await this.waitForApproval(runId, nextNode.id);
          return;
        }

        const result = await this.executeNode(
          runId,
          nextNode,
          controller.signal,
        );
        const completed = await this.completeNode(
          runId,
          context.workflow,
          nextNode,
          result,
        );
        if (!completed) {
          return;
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      await this.failRun(
        runId,
        error instanceof Error ? error.message : 'Unknown execution failure.',
      );
    } finally {
      if (this.activeRuns.get(runId) === controller) {
        this.activeRuns.delete(runId);
      }
    }
  }

  private findReadyNode(
    workflow: WorkflowDefinition,
    run: RunRecord,
  ): WorkflowNode | undefined {
    return workflow.nodes.find((node) => {
      if (
        !run.activatedNodeIds.includes(node.id) ||
        run.completedNodeIds.includes(node.id)
      ) {
        return false;
      }
      const activePredecessors = workflow.edges
        .filter(
          (edge) =>
            edge.target === node.id &&
            run.activatedNodeIds.includes(edge.source),
        )
        .map((edge) => edge.source);
      return activePredecessors.every((source) =>
        run.completedNodeIds.includes(source),
      );
    });
  }

  private async executeNode(
    runId: string,
    node: WorkflowNode,
    signal: AbortSignal,
  ): Promise<unknown> {
    signal.throwIfAborted();
    await this.events.emit(runId, 'node.started', `${node.label} started.`, {
      nodeId: node.id,
      data: { nodeType: node.type },
    });

    let result: unknown = true;
    switch (node.type) {
      case 'condition':
        result = node.config.result === true;
        break;
      case 'wait': {
        const requested =
          typeof node.config.durationMs === 'number'
            ? node.config.durationMs
            : 250;
        await sleep(Math.min(Math.max(requested, 0), MAX_WAIT_MS), signal);
        result = requested;
        break;
      }
      case 'httpRequest':
        result = await this.executeHttp(node, signal);
        break;
      case 'agentLoop':
        result = await this.executeAgentLoop(runId, node, signal);
        break;
      case 'transform':
      case 'output':
        result = node.config.value ?? true;
        break;
      case 'notification':
        signal.throwIfAborted();
        await this.events.emit(
          runId,
          'notification.emitted',
          String(node.config.message ?? 'Workflow notification'),
          { nodeId: node.id, data: { channel: node.config.channel ?? 'default' } },
        );
        break;
      default:
        result = true;
    }
    return result;
  }

  private async executeHttp(
    node: WorkflowNode,
    signal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const url = node.config.url;
    if (typeof url !== 'string' || url.trim() === '') {
      return { simulated: true, status: 200 };
    }
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('HTTP nodes support only http and https URLs.');
    }
    const method =
      typeof node.config.method === 'string'
        ? node.config.method.toUpperCase()
        : 'GET';
    const response = await fetch(parsed, {
      method,
      signal: AbortSignal.any([
        signal,
        AbortSignal.timeout(HTTP_TIMEOUT_MS),
      ]),
    });
    if (!response.ok) {
      throw new Error(`HTTP request failed with status ${response.status}.`);
    }
    return {
      status: response.status,
      contentType: response.headers.get('content-type') ?? 'unknown',
    };
  }

  private async executeAgentLoop(
    runId: string,
    node: WorkflowNode,
    signal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const maxIterations =
      typeof node.config.maxIterations === 'number'
        ? node.config.maxIterations
        : 1;
    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      signal.throwIfAborted();
      await this.events.emit(
        runId,
        'agent.iteration',
        `Agent iteration ${iteration} of ${maxIterations}.`,
        {
          nodeId: node.id,
          data: { iteration, goal: node.config.goal ?? 'Complete the task' },
        },
      );
      const continued = await this.store.mutate((state) => {
        const run = state.runs.find((candidate) => candidate.id === runId);
        if (run === undefined || run.status === 'cancelled') {
          return false;
        }
        run.costUsd = Number((run.costUsd + 0.0015).toFixed(4));
        return true;
      });
      if (!continued) {
        signal.throwIfAborted();
        throw new Error('Run stopped during agent execution.');
      }
    }
    return { iterations: maxIterations, outcome: 'bounded-completion' };
  }

  private async completeNode(
    runId: string,
    workflow: WorkflowDefinition,
    node: WorkflowNode,
    result: unknown,
  ): Promise<boolean> {
    const completed = await this.store.mutate((state) => {
      const run = state.runs.find((candidate) => candidate.id === runId);
      if (run === undefined) {
        throw new Error('Run not found while completing node.');
      }
      if (run.status === 'cancelled') {
        return false;
      }
      if (!run.completedNodeIds.includes(node.id)) {
        run.completedNodeIds.push(node.id);
      }
      for (const edge of workflow.edges.filter(
        (candidate) =>
          candidate.source === node.id && edgeMatches(candidate, result),
      )) {
        if (!run.activatedNodeIds.includes(edge.target)) {
          run.activatedNodeIds.push(edge.target);
        }
      }
      return true;
    });
    if (!completed) {
      return false;
    }
    await this.events.emit(runId, 'node.completed', `${node.label} completed.`, {
      nodeId: node.id,
      data: { result },
    });
    return true;
  }

  private async transitionToRunning(runId: string): Promise<boolean> {
    return this.store.mutate((state) => {
      const run = state.runs.find((candidate) => candidate.id === runId);
      if (run === undefined) {
        throw new Error('Run not found.');
      }
      if (!['queued', 'running'].includes(run.status)) {
        return false;
      }
      run.status = 'running';
      return true;
    });
  }

  private async waitForApproval(runId: string, nodeId: string): Promise<void> {
    const waiting = await this.store.mutate((state) => {
      const run = state.runs.find((candidate) => candidate.id === runId);
      if (run === undefined) {
        throw new Error('Run not found.');
      }
      if (run.status === 'cancelled') {
        return false;
      }
      run.status = 'waiting';
      return true;
    });
    if (!waiting) {
      return;
    }
    await this.events.emit(
      runId,
      'approval.requested',
      'Workflow is waiting for human approval.',
      { nodeId },
    );
  }

  private async completeRun(runId: string): Promise<void> {
    const completedAt = new Date();
    const completed = await this.store.mutate((state) => {
      const run = state.runs.find((candidate) => candidate.id === runId);
      if (run === undefined) {
        throw new Error('Run not found.');
      }
      if (run.status === 'cancelled') {
        return false;
      }
      run.status = 'succeeded';
      run.completedAt = completedAt.toISOString();
      run.durationMs =
        completedAt.getTime() - new Date(run.startedAt).getTime();
      return true;
    });
    if (completed) {
      await this.events.emit(runId, 'run.succeeded', 'Workflow run succeeded.');
    }
  }

  private async failRun(runId: string, message: string): Promise<void> {
    const completedAt = new Date();
    const failed = await this.store.mutate((state) => {
      const run = state.runs.find((candidate) => candidate.id === runId);
      if (run === undefined || run.status === 'cancelled') {
        return false;
      }
      run.status = 'failed';
      run.error = message;
      run.completedAt = completedAt.toISOString();
      run.durationMs =
        completedAt.getTime() - new Date(run.startedAt).getTime();
      return true;
    });
    if (failed) {
      await this.events.emit(runId, 'run.failed', message);
    }
  }
}
