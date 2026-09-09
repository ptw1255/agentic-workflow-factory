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
    case 'agentLoop': {
      const maxIterations =
        typeof input.config.maxIterations === 'number'
          ? input.config.maxIterations
          : 1;
      return {
        nodeId: input.nodeId,
        result: { iterations: maxIterations, outcome: 'bounded-completion' },
      };
    }
    case 'code': {
      const operation = typeof input.config.operation === 'string'
        ? input.config.operation
        : 'identity';
      const value = input.config.value ?? '';
      switch (operation) {
        case 'identity': return { nodeId: input.nodeId, result: value };
        case 'uppercase': return { nodeId: input.nodeId, result: String(value).toUpperCase() };
        case 'lowercase': return { nodeId: input.nodeId, result: String(value).toLowerCase() };
        case 'trim': return { nodeId: input.nodeId, result: String(value).trim() };
        case 'json.parse': return { nodeId: input.nodeId, result: JSON.parse(String(value)) as unknown };
        case 'json.stringify': return { nodeId: input.nodeId, result: JSON.stringify(value) };
        default: throw new Error(`Unsupported deterministic code operation "${operation}".`);
      }
    }
    default:
      return {
        nodeId: input.nodeId,
        result: input.config.value ?? true,
      };
  }
}
