import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import fastifyStatic from '@fastify/static';
import Fastify, {
  type FastifyError,
  type FastifyInstance,
} from 'fastify';

import { ProposalService } from '../agents/proposal-service.js';
import { ConnectionService } from '../connections/connection-service.js';
import { VaultSecretBroker } from '../connections/vault-secret-broker.js';
import { nodeCatalog } from '../domain/catalog.js';
import {
  createProjectSchema,
  cloneWorkflowSchema,
  createConnectionSchema,
  createProposalSchema,
  createTenantSchema,
  workflowDefinitionSchema,
} from '../domain/schema.js';
import type { WorkflowDefinition } from '../domain/types.js';
import { validateWorkflow } from '../domain/validator.js';
import { defaultFactoryManifest } from '../factory/manifest.js';
import { calculateFactoryMetrics } from '../factory/metrics.js';
import { EventService } from '../observability/event-service.js';
import { CompositeTelemetryExporter, OtlpHttpExporter } from '../observability/otlp-exporter.js';
import { LocalWorkflowExecutor } from '../runtime/executor.js';
import { JsonStore } from '../storage/json-store.js';
import { PostgresStore } from '../storage/postgres-store.js';
import { DEFAULT_PROJECT_ID, DEFAULT_TENANT_ID, type PlatformStore } from '../storage/store.js';

export interface AppOptions {
  dataFile?: string;
  databaseUrl?: string;
  store?: PlatformStore;
  secretBroker?: import('../connections/secret-broker.js').SecretBroker;
  logger?: boolean;
  serveStatic?: boolean;
  observabilityRetentionHours?: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected platform error.';
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function scopeFromRequest(request: { headers: Record<string, string | string[] | undefined> }) {
  return {
    tenantId: headerValue(request.headers['x-tenant-id']) ?? DEFAULT_TENANT_ID,
    projectId: headerValue(request.headers['x-project-id']) ?? DEFAULT_PROJECT_ID,
  };
}

function inScope(value: { tenantId?: string; projectId?: string }, scope: { tenantId: string; projectId: string }): boolean {
  return value.tenantId === scope.tenantId && value.projectId === scope.projectId;
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? Number.NaN : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function telemetryExporter(): CompositeTelemetryExporter | undefined {
  const exporters = [];
  const configuredPhoenixEndpoint = process.env.PHOENIX_ENDPOINT ?? process.env.PHOENIX_COLLECTOR_ENDPOINT;
  const phoenixEndpoint = configuredPhoenixEndpoint?.trim() || undefined;
  const phoenixApiKey = process.env.PHOENIX_API_KEY;
  if (phoenixEndpoint !== undefined) {
    exporters.push(new OtlpHttpExporter(
      phoenixEndpoint,
      phoenixApiKey === undefined ? {} : { api_key: phoenixApiKey },
      { deleteTraces: true, signals: ['trace'] },
    ));
  }
  const configuredOtlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const otlpEndpoint = configuredOtlpEndpoint?.trim() || undefined;
  if (otlpEndpoint !== undefined && otlpEndpoint !== phoenixEndpoint) {
    exporters.push(new OtlpHttpExporter(otlpEndpoint));
  }
  return exporters.length === 0 ? undefined : new CompositeTelemetryExporter(exporters);
}

export async function createApp(
  options: AppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const dataFile =
    options.dataFile ??
    process.env.DATA_FILE ??
    path.join(process.cwd(), '.data', 'state.json');
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  const store: PlatformStore = options.store ?? (databaseUrl === undefined
    ? new JsonStore(dataFile)
    : new PostgresStore(databaseUrl));
  const vaultAddress = process.env.VAULT_ADDR;
  const vaultToken = process.env.VAULT_TOKEN;
  const secretBroker = options.secretBroker ?? (
    vaultAddress !== undefined && vaultToken !== undefined
      ? new VaultSecretBroker({ address: vaultAddress, token: vaultToken })
      : undefined
  );
  const retentionHours = options.observabilityRetentionHours
    ?? positiveNumber(process.env.OBSERVABILITY_RETENTION_HOURS, 48);
  const exporter = telemetryExporter();
  const events = new EventService(store, { retentionHours, exporter });
  const executor = new LocalWorkflowExecutor(store, events);
  const connections = new ConnectionService(store, secretBroker);
  const proposals = new ProposalService(store);
  if (store.close !== undefined) {
    app.addHook('onClose', async () => store.close?.());
  }
  const retentionTimer = setInterval(() => void events.prune(), 15 * 60 * 1000);
  retentionTimer.unref?.();
  app.addHook('onClose', async () => {
    clearInterval(retentionTimer);
    await events.close();
  });

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
    storage: databaseUrl === undefined ? 'json' : 'postgresql',
    observability: {
      retentionHours,
      otlpExportEnabled: exporter !== undefined,
    },
    timestamp: new Date().toISOString(),
  }));

  app.get('/api/catalog/nodes', async () => ({ items: nodeCatalog }));

  app.get('/api/tenants', async () => ({
    items: await store.read((state) => state.tenants),
  }));

  app.post<{ Body: unknown }>('/api/tenants', async (request, reply) => {
    const parsed = createTenantSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ message: 'Tenant metadata is invalid.', issues: parsed.error.issues });
    }
    const tenant = {
      id: `tenant-${randomUUID()}`,
      name: parsed.data.name,
      createdAt: new Date().toISOString(),
    };
    await store.mutate((state) => {
      state.tenants.push(tenant);
    });
    return tenant;
  });

  app.get('/api/projects', async (request) => {
    const { tenantId } = scopeFromRequest(request);
    return { items: await store.read((state) => state.projects.filter((project) => project.tenantId === tenantId)) };
  });

  app.post<{ Body: unknown }>('/api/projects', async (request, reply) => {
    const parsed = createProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ message: 'Project metadata is invalid.', issues: parsed.error.issues });
    }
    const scope = scopeFromRequest(request);
    const tenantId = parsed.data.tenantId ?? scope.tenantId;
    const project = {
      id: `project-${randomUUID()}`,
      tenantId,
      name: parsed.data.name,
      description: parsed.data.description,
      createdAt: new Date().toISOString(),
    };
    const exists = await store.read((state) => state.tenants.some((tenant) => tenant.id === tenantId));
    if (!exists) return reply.status(404).send({ message: 'Tenant not found.' });
    await store.mutate((state) => {
      state.projects.push(project);
    });
    return project;
  });

  app.post<{ Params: { projectId: string }; Body: unknown }>(
    '/api/projects/:projectId/workflows',
    async (request, reply) => {
      const parsed = cloneWorkflowSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({ message: 'Workflow clone request is invalid.', issues: parsed.error.issues });
      }
      const scope = scopeFromRequest(request);
      let cloned: WorkflowDefinition;
      try {
        cloned = await store.mutate((state) => {
        const project = state.projects.find((candidate) =>
          candidate.id === request.params.projectId && candidate.tenantId === scope.tenantId,
        );
        if (project === undefined) throw new Error('Project not found.');
        const source = state.workflows.find((candidate) =>
          candidate.id === parsed.data.sourceWorkflowId && inScope(candidate, scope),
        );
        if (source === undefined) throw new Error('Source workflow not found.');
        const now = new Date().toISOString();
        const workflow: WorkflowDefinition = {
          ...structuredClone(source),
          tenantId: scope.tenantId,
          projectId: project.id,
          id: `workflow-${randomUUID()}`,
          name: parsed.data.name ?? `${source.name} copy`,
          version: 1,
          status: 'draft',
          createdAt: now,
          updatedAt: now,
        };
        state.workflows.push(workflow);
        state.workflowVersions.push(structuredClone(workflow));
        return workflow;
        });
      } catch (error) {
        return reply.status(404).send({ message: errorMessage(error) });
      }
      return cloned;
    },
  );

  app.get('/api/workflows', async (request) => {
    const scope = scopeFromRequest(request);
    return {
      items: await store.read((state) => state.workflows.filter((workflow) => inScope(workflow, scope))),
    };
  });

  app.get<{ Params: { id: string } }>('/api/workflows/:id', async (request, reply) => {
    const scope = scopeFromRequest(request);
    const workflow = await store.read((state) =>
      state.workflows.find((candidate) => candidate.id === request.params.id && inScope(candidate, scope)),
    );
    if (workflow === undefined) {
      return reply.status(404).send({ message: 'Workflow not found.' });
    }
    return workflow;
  });

  app.get<{ Params: { id: string } }>(
    '/api/workflows/:id/versions',
    async (request, reply) => {
      const scope = scopeFromRequest(request);
      const exists = await store.read((state) =>
        state.workflows.some((workflow) => workflow.id === request.params.id && inScope(workflow, scope)),
      );
      if (!exists) {
        return reply.status(404).send({ message: 'Workflow not found.' });
      }
      const versions = await store.read((state) =>
        state.workflowVersions
          .filter((workflow) => workflow.id === request.params.id && inScope(workflow, scope))
          .sort((left, right) => right.version - left.version),
      );
      return { items: versions };
    },
  );

  app.get<{ Params: { id: string; version: string } }>(
    '/api/workflows/:id/versions/:version',
    async (request, reply) => {
      const scope = scopeFromRequest(request);
      const version = Number(request.params.version);
      if (!Number.isSafeInteger(version) || version < 1) {
        return reply.status(400).send({ message: 'Workflow version must be a positive integer.' });
      }
      const workflow = await store.read((state) =>
        state.workflowVersions.find(
          (candidate) =>
            candidate.id === request.params.id &&
            candidate.version === version &&
            inScope(candidate, scope),
        ),
      );
      if (workflow === undefined) {
        return reply.status(404).send({ message: 'Workflow version not found.' });
      }
      return workflow;
    },
  );

  app.put<{ Params: { id: string }; Body: WorkflowDefinition }>(
    '/api/workflows/:id',
    async (request, reply) => {
      const scope = scopeFromRequest(request);
      const parsed = workflowDefinitionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({
          message: 'Workflow schema is invalid.',
          issues: parsed.error.issues,
        });
      }
      const incoming: WorkflowDefinition = {
        ...parsed.data,
        tenantId: scope.tenantId,
        projectId: scope.projectId,
      };
      const validation = validateWorkflow(incoming);
      if (!validation.valid) {
        return reply.status(422).send({
          message: 'Workflow graph is invalid.',
          issues: validation.issues,
        });
      }

      const saved = await store.mutate((state) => {
        const index = state.workflows.findIndex(
          (candidate) => candidate.id === request.params.id && candidate.projectId === scope.projectId,
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
        state.workflowVersions.push(structuredClone(next));
        return next;
      });
      return saved;
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/workflows/:id/validate',
    async (request, reply) => {
      const scope = scopeFromRequest(request);
      const workflow = await store.read((state) =>
        state.workflows.find((candidate) => candidate.id === request.params.id && inScope(candidate, scope)),
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
      const scope = scopeFromRequest(request);
      const workflow = await store.read((state) =>
        state.workflows.find((candidate) => candidate.id === request.params.id && inScope(candidate, scope)),
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

  app.get('/api/runs', async (request) => {
    const scope = scopeFromRequest(request);
    return { items: await store.read((state) => state.runs.filter((run) => inScope(run, scope))) };
  });

  app.get<{ Params: { id: string } }>('/api/runs/:id', async (request, reply) => {
    const scope = scopeFromRequest(request);
    const run = await store.read((state) =>
      state.runs.find((candidate) => candidate.id === request.params.id && inScope(candidate, scope)),
    );
    if (run === undefined) {
      return reply.status(404).send({ message: 'Run not found.' });
    }
    return run;
  });

  app.post<{ Params: { id: string } }>(
    '/api/runs/:id/approve',
    async (request, reply) => {
      const scope = scopeFromRequest(request);
      try {
        const belongs = await store.read((state) => state.runs.some((run) => run.id === request.params.id && inScope(run, scope)));
        if (!belongs) return reply.status(404).send({ message: 'Run not found.' });
        return await executor.approve(request.params.id);
      } catch (error) {
        return reply.status(409).send({ message: errorMessage(error) });
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/runs/:id/cancel',
    async (request, reply) => {
      const scope = scopeFromRequest(request);
      try {
        const belongs = await store.read((state) => state.runs.some((run) => run.id === request.params.id && inScope(run, scope)));
        if (!belongs) return reply.status(404).send({ message: 'Run not found.' });
        return await executor.cancel(request.params.id);
      } catch (error) {
        return reply.status(409).send({ message: errorMessage(error) });
      }
    },
  );

  app.get<{ Querystring: { runId?: string } }>('/api/events', async (request) => {
    const scope = scopeFromRequest(request);
    return { items: (await events.list(request.query.runId)).filter((event) => inScope(event, scope)) };
  });

  app.get<{
    Querystring: { runId?: string; signal?: 'log' | 'trace' | 'metric' };
  }>('/api/telemetry', async (request) => {
    const scope = scopeFromRequest(request);
    const items = (await events.list(request.query.runId)).filter((event) => inScope(event, scope));
    return {
      resource: {
        'service.name': 'agentic-workflow-factory',
        'telemetry.sdk.name': 'opentelemetry',
        'openinference.version': '1',
      },
      items: request.query.signal === undefined
        ? items
        : items.filter((event) => event.signal === request.query.signal),
    };
  });

  app.get('/api/connections', async (request) => {
    const scope = scopeFromRequest(request);
    return { items: await connections.list(scope.projectId, scope.tenantId) };
  });

  app.post<{ Body: unknown }>('/api/connections', async (request, reply) => {
    const parsed = createConnectionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        message: 'Connection metadata is invalid.',
        issues: parsed.error.issues,
      });
    }
    try {
      const scope = scopeFromRequest(request);
      return await connections.create({ ...parsed.data, ...scope });
    } catch (error) {
      return reply.status(409).send({ message: errorMessage(error) });
    }
  });

  app.post<{ Params: { id: string } }>(
    '/api/connections/:id/check',
    async (request, reply) => {
      const scope = scopeFromRequest(request);
      try {
        return await connections.check(request.params.id, scope.projectId, scope.tenantId);
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
    const scope = scopeFromRequest(request);
    const workflow = await store.read((state) =>
      state.workflows.find(
        (candidate) => candidate.id === parsed.data.workflowId && inScope(candidate, scope),
      ),
    );
    if (workflow === undefined) {
      return reply.status(404).send({ message: 'Workflow not found.' });
    }
    return proposals.create(workflow, parsed.data.goal);
  });

  app.get('/api/agent/proposals', async (request) => {
    const scope = scopeFromRequest(request);
    return { items: await store.read((state) => state.proposals.filter((proposal) => inScope(proposal, scope))) };
  });

  app.get('/api/factory/metrics', async (request) => {
    const scope = scopeFromRequest(request);
    const runs = await store.read((state) => state.runs.filter((run) => inScope(run, scope)));
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

  await events.prune();
  await executor.recover();
  return app;
}
