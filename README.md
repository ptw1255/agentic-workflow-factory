# Agentic Workflow Factory

A working foundation for an n8n-style, agent-led workflow product. It combines a
React Flow authoring dashboard, typed workflow contracts, durable local preview
execution, Temporal workflow definitions, correlated observability, managed
connection metadata, bounded agent proposals, and factory metrics.

The implementation lives under [`src/`](src/). The product and factory roadmaps
remain at the repository root and under [`FACTORY/`](FACTORY/).

## Run locally

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` requests to the Fastify server on
port 3100. Runtime state is stored in `.data/state.json`; credentials are never
accepted or stored by the connection API.

Useful commands:

```bash
npm run typecheck
npm test
npm run build
npm run demo
npm run server
```

`npm run check` runs type checking, tests, and the production web build.

## Product surfaces

- **Studio:** edit a typed workflow on a React Flow canvas, configure nodes, validate,
  save immutable versions, and launch runs.
- **Runs:** inspect status, cost, human touchpoints, node events, agent iterations,
  failures, and approval waits.
- **Connections:** manage non-secret connector metadata, environment bindings, scopes,
  health, and use.
- **Agent proposals:** turn an outcome into a reviewable, bounded workflow proposal.
  The included planner is deterministic so the repository runs without external AI
  credentials; its service boundary can be replaced with a model-backed planner.
- **Factory:** view throughput, success, cost, automation, human burden, and
  stage-level performance.

## Architecture

```text
src/
  agents/          # Reviewable workflow proposal service
  connections/     # Credential-free connection metadata and health
  domain/          # Canonical schemas, graph validator, catalog, and types
  factory/         # Factory manifest and metrics
  observability/   # Correlated run event service
  runtime/         # Persistent local preview executor and approvals
  server/          # API-first Fastify control plane
  storage/         # Atomic JSON development persistence
  temporal/        # Durable Temporal workflow and activity worker
  web/             # React dashboard and workflow studio
```

The local executor makes development self-contained and explicitly reports itself as
`local-durable-preview`. It checkpoints each node to persistent state, supports
bounded agent loops and human approval/resume, and records correlated events. For a
Temporal deployment, run a Temporal service and start:

```bash
TEMPORAL_ADDRESS=localhost:7233 npm run worker
```

The generic Temporal workflow pins a full definition, executes nondeterministic work
in activities, uses a signal for approvals, and applies activity retry policy. A
production deployment should replace the development JSON store with PostgreSQL and
route run creation through a Temporal client while retaining the same public API.

## Safety model

- Unknown node types, orphaned edges, cycles, duplicate IDs, trigger mismatches, and
  unbounded agent loops are rejected before execution.
- Agent output is a proposal against a known workflow version and cannot deploy.
- Workflow saves use optimistic version checks.
- Connections contain metadata and scopes only; runtime secret brokerage remains an
  external integration boundary.
- HTTP activities enforce protocol checks, timeouts, and surfaced failures.
- Human approval, cancellation, costs, tool-like actions, and node transitions are
  auditable events.
