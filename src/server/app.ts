import { existsSync } from 'node:fs';
import path from 'node:path';

import fastifyStatic from '@fastify/static';
import Fastify, {
  type FastifyError,
  type FastifyInstance,
} from 'fastify';

import { ProposalService } from '../agents/proposal-service.js';
import { ConnectionService } from '../connections/connection-service.js';
import { nodeCatalog } from '../domain/catalog.js';
import {
  createConnectionSchema,
  createProposalSchema,
  workflowDefinitionSchema,
} from '../domain/schema.js';
import type { WorkflowDefinition } from '../domain/types.js';
import { validateWorkflow } from '../domain/validator.js';
import { defaultFactoryManifest } from '../factory/manifest.js';
import { calculateFactoryMetrics } from '../factory/metrics.js';
import { EventService } from '../observability/event-service.js';
import { LocalWorkflowExecutor } from '../runtime/executor.js';
import { JsonStore } from '../storage/json-store.js';

export interface AppOptions {
  dataFile?: string;
  logger?: boolean;
  serveStatic?: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected platform error.';
}

export async function createApp(
  options: AppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const dataFile =
    options.dataFile ??
    process.env.DATA_FILE ??
    path.join(process.cwd(), '.data', 'state.json');
  const store = new JsonStore(dataFile);
  const events = new EventService(store);
  const executor = new LocalWorkflowExecutor(store, events);
  const connections = new ConnectionService(store);
  const proposals = new ProposalService(store);

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const statusCode = error.validation === undefined ? 400 : 422;
    void reply.status(statusCode).send({
      error: error.name,
      message: error.message,
    });
  });

  app.get('/api/health', async () => ({
    status: 'ok',
    executionEngine: 'local-durable-preview',
    timestamp: new Date().toISOString(),
  }));

  app.get('/api/catalog/nodes', async () => ({ items: nodeCatalog }));

  app.get('/api/workflows', async () => ({
    items: await store.read((state) => state.workflows),
  }));

  app.get<{ Params: { id: string } }>('/api/workflows/:id', async (request, reply) => {
    const workflow = await store.read((state) =>
      state.workflows.find((candidate) => candidate.id === request.params.id),
    );
    if (workflow === undefined) {
      return reply.status(404).send({ message: 'Workflow not found.' });
    }
    return workflow;
  });

  app.put<{ Params: { id: string }; Body: WorkflowDefinition }>(
    '/api/workflows/:id',
    async (request, reply) => {
      const parsed = workflowDefinitionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({
          message: 'Workflow schema is invalid.',
          issues: parsed.error.issues,
        });
      }
      const incoming = parsed.data;
      const validation = validateWorkflow(incoming);
      if (!validation.valid) {
        return reply.status(422).send({
          message: 'Workflow graph is invalid.',
          issues: validation.issues,
        });
      }

      const saved = await store.mutate((state) => {
        const index = state.workflows.findIndex(
          (candidate) => candidate.id === request.params.id,
        );
        if (index < 0) {
          throw new Error('Workflow not found.');
        }
        const current = state.workflows[index];
        if (current === undefined) {
          throw new Error('Workflow not found.');
        }
        if (incoming.id !== request.params.id) {
          throw new Error('Workflow ID cannot be changed.');
        }
        if (incoming.version !== current.version) {
          throw new Error(
            `Workflow version conflict: expected ${current.version}, received ${incoming.version}.`,
          );
        }
        const next: WorkflowDefinition = {
          ...incoming,
          version: current.version + 1,
          createdAt: current.createdAt,
          updatedAt: new Date().toISOString(),
        };
        state.workflows[index] = next;
        return next;
      });
      return saved;
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/workflows/:id/validate',
    async (request, reply) => {
      const workflow = await store.read((state) =>
        state.workflows.find((candidate) => candidate.id === request.params.id),
      );
      if (workflow === undefined) {
        return reply.status(404).send({ message: 'Workflow not found.' });
      }
      return validateWorkflow(workflow);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/workflows/:id/runs',
    async (request, reply) => {
      const workflow = await store.read((state) =>
        state.workflows.find((candidate) => candidate.id === request.params.id),
      );
      if (workflow === undefined) {
        return reply.status(404).send({ message: 'Workflow not found.' });
      }
      try {
        return await executor.start(workflow);
      } catch (error) {
        return reply.status(422).send({ message: errorMessage(error) });
      }
    },
  );

  app.get('/api/runs', async () => ({
    items: await store.read((state) => state.runs),
  }));

  app.get<{ Params: { id: string } }>('/api/runs/:id', async (request, reply) => {
    const run = await store.read((state) =>
      state.runs.find((candidate) => candidate.id === request.params.id),
    );
    if (run === undefined) {
      return reply.status(404).send({ message: 'Run not found.' });
    }
    return run;
  });

  app.post<{ Params: { id: string } }>(
    '/api/runs/:id/approve',
    async (request, reply) => {
      try {
        return await executor.approve(request.params.id);
      } catch (error) {
        return reply.status(409).send({ message: errorMessage(error) });
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/runs/:id/cancel',
    async (request, reply) => {
      try {
        return await executor.cancel(request.params.id);
      } catch (error) {
        return reply.status(409).send({ message: errorMessage(error) });
      }
    },
  );

  app.get<{ Querystring: { runId?: string } }>('/api/events', async (request) => ({
    items: await events.list(request.query.runId),
  }));

  app.get('/api/connections', async () => ({ items: await connections.list() }));

  app.post<{ Body: unknown }>('/api/connections', async (request, reply) => {
    const parsed = createConnectionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        message: 'Connection metadata is invalid.',
        issues: parsed.error.issues,
      });
    }
    try {
      return await connections.create(parsed.data);
    } catch (error) {
      return reply.status(409).send({ message: errorMessage(error) });
    }
  });

  app.post<{ Params: { id: string } }>(
    '/api/connections/:id/check',
    async (request, reply) => {
      try {
        return await connections.check(request.params.id);
      } catch (error) {
        return reply.status(404).send({ message: errorMessage(error) });
      }
    },
  );

  app.post<{ Body: unknown }>('/api/agent/proposals', async (request, reply) => {
    const parsed = createProposalSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        message: 'Agent proposal request is invalid.',
        issues: parsed.error.issues,
      });
    }
    const workflow = await store.read((state) =>
      state.workflows.find(
        (candidate) => candidate.id === parsed.data.workflowId,
      ),
    );
    if (workflow === undefined) {
      return reply.status(404).send({ message: 'Workflow not found.' });
    }
    return proposals.create(workflow, parsed.data.goal);
  });

  app.get('/api/agent/proposals', async () => ({
    items: await store.read((state) => state.proposals),
  }));

  app.get('/api/factory/metrics', async () => {
    const runs = await store.read((state) => state.runs);
    return calculateFactoryMetrics(runs);
  });

  app.get('/api/factory/manifest', async () => defaultFactoryManifest);

  const staticRoot = path.join(process.cwd(), 'dist');
  if ((options.serveStatic ?? true) && existsSync(staticRoot)) {
    await app.register(fastifyStatic, {
      root: staticRoot,
      prefix: '/',
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({ message: 'API route not found.' });
      }
      return reply.sendFile('index.html');
    });
  }

  await executor.recover();
  return app;
}
