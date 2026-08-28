export interface NodeActivityInput {
  runId: string;
  nodeId: string;
  nodeType: string;
  label: string;
  config: Record<string, unknown>;
}

export interface NodeActivityResult {
  nodeId: string;
  result: unknown;
}

export async function executeNodeActivity(
  input: NodeActivityInput,
): Promise<NodeActivityResult> {
  switch (input.nodeType) {
    case 'wait': {
      const durationMs =
        typeof input.config.durationMs === 'number'
          ? Math.min(Math.max(input.config.durationMs, 0), 60_000)
          : 250;
      await new Promise((resolve) => setTimeout(resolve, durationMs));
      return { nodeId: input.nodeId, result: durationMs };
    }
    case 'httpRequest': {
      const url = input.config.url;
      if (typeof url !== 'string' || url.trim() === '') {
        return {
          nodeId: input.nodeId,
          result: { simulated: true, status: 200 },
        };
      }
      const response = await fetch(url, {
        method:
          typeof input.config.method === 'string'
            ? input.config.method
            : 'GET',
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`HTTP request failed with status ${response.status}.`);
      }
      return {
        nodeId: input.nodeId,
        result: { status: response.status },
      };
    }
    case 'condition':
      return {
        nodeId: input.nodeId,
        result: input.config.result === true,
      };
    default:
      return {
        nodeId: input.nodeId,
        result: input.config.value ?? true,
      };
  }
}
