import type { FactoryMetrics, RunRecord, StageMetric } from '../domain/types.js';

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function successRate(runs: RunRecord[]): number {
  const completed = runs.filter((run) =>
    ['succeeded', 'failed'].includes(run.status),
  );
  if (completed.length === 0) {
    return 0;
  }
  return (
    (completed.filter((run) => run.status === 'succeeded').length /
      completed.length) *
    100
  );
}

function stageMetric(stage: string, runs: RunRecord[]): StageMetric {
  return {
    stage,
    runs: runs.length,
    successRate: Number(successRate(runs).toFixed(1)),
    averageDurationMs: Math.round(
      average(
        runs
          .map((run) => run.durationMs)
          .filter((duration): duration is number => duration !== undefined),
      ),
    ),
  };
}

export function calculateFactoryMetrics(runs: RunRecord[]): FactoryMetrics {
  const completed = runs.filter((run) =>
    ['succeeded', 'failed', 'cancelled'].includes(run.status),
  );
  const totalHumanTouchpoints = completed.reduce(
    (total, run) => total + run.humanTouchpoints,
    0,
  );
  const possibleAutomatedTransitions = completed.reduce(
    (total, run) => total + Math.max(run.completedNodeIds.length, 1),
    0,
  );

  const recent = completed.filter(
    (run) => Date.now() - new Date(run.startedAt).getTime() <= 7 * 86_400_000,
  );
  const agentRuns = completed.filter((run) =>
    run.activatedNodeIds.some((nodeId) => nodeId.toLowerCase().includes('agent')),
  );
  const humanRuns = completed.filter((run) => run.humanTouchpoints > 0);

  return {
    throughput: recent.length,
    costPerRun: Number(
      average(completed.map((run) => run.costUsd)).toFixed(4),
    ),
    automationPercent:
      possibleAutomatedTransitions === 0
        ? 100
        : Number(
            (
              ((possibleAutomatedTransitions - totalHumanTouchpoints) /
                possibleAutomatedTransitions) *
              100
            ).toFixed(1),
          ),
    humanTouchpoints: Number(
      (completed.length === 0
        ? 0
        : totalHumanTouchpoints / completed.length
      ).toFixed(2),
    ),
    successRate: Number(successRate(completed).toFixed(1)),
    stageMetrics: [
      stageMetric('All workflows', completed),
      stageMetric('Agent-assisted', agentRuns),
      stageMetric('Human-gated', humanRuns),
    ],
  };
}
