# Closed-Loop Software Factory Plan

## 1. Evidence and synthesis boundary

This plan extends `WORKFLOW_PLATFORM_PLAN.md` using the linked Zach Lloyd post:

`https://x.com/zachlloydtweets/status/2093023948774449655?s=42`

The post argues for a cloud software factory as an engineering system around the
software-development lifecycle. Its directly stated principles are:

- Define factories as code, keep them in version control, and make their definitions
  editable through agent-proposed diffs.
- Run the factory in the cloud so automation is always available, teams share it,
  and run traces plus telemetry accumulate centrally.
- Make the execution engine API-first rather than UI-first.
- Build in metrics, scorers, observers, self-improvement loops, and benchmarks.
- Support multiple models and multiple specialized agents.
- Measure PR throughput, average cost per PR, automation percentage/human touchpoints,
  estimated savings over human work, and—where possible—acceleration of shipped
  product.
- Close the loop: factory agents perform work, scorer agents grade traces,
  improvement agents find patterns and propose definition changes, humans review
  those changes as pull requests, and benchmarks validate promising configurations.

The maturity model, architecture, controls, metrics definitions, rollout gates, and
progressive outcomes below are a synthesis that applies those principles to this
project's React/Temporal workflow platform. They are not quotations or claims that
the post prescribed this exact implementation.

## 2. Factory outcome

Transform the workflow platform into a cloud, API-first, version-controlled product
factory that can:

1. Accept product and engineering demand from repositories, issue trackers,
   incidents, users, schedules, and APIs.
2. Route each item through explicit agent stages such as triage, specification,
   implementation, verification, review, deployment, and monitoring.
3. Preserve every agent turn, tool action, artifact, human intervention, cost, and
   result as correlated evidence.
4. Score completed work against quality, correctness, security, cost, speed, and
   product-specific rubrics.
5. Discover recurring strengths and failures across scored runs.
6. Propose reviewable changes to the factory's own code, agents, skills, policies,
   models, prompts, tools, and routing.
7. Benchmark alternative factory configurations on representative tasks.
8. Promote only measured improvements through normal review and deployment controls.

The target is guided self-improvement, not unsupervised self-modification. Agents may
edit factory definitions only by producing versioned proposals; protected
environments require policy checks and human approval.

## 3. Relationship to the foundational platform

The foundational plan supplies reusable workflow primitives:

- The React dashboard is the authoring, operational, and analytical console.
- The canonical workflow definition provides a typed source of truth.
- Temporal is the durable, replayable orchestration runtime.
- The connection manager brokers access to GitHub, issue trackers, CI/CD, telemetry,
  cloud environments, model providers, and internal systems.
- The observability model supplies traces, metrics, logs, costs, artifacts, and
  audit history.
- The agent control service constrains proposal and runtime agents.

FACTORY adds a meta-engineering layer:

- A factory-as-code manifest spanning multiple workflows and agent roles
- An SDLC-oriented run model joining all work for one demand item
- Scorers and observer schedules
- Aggregate factory metrics and economics
- Improvement agents that propose manifest diffs
- Benchmark suites and experiment comparison
- Promotion policy for factory configuration changes
- Team/repository/product ownership boundaries

The dashboard remains important, but it is a client of the same APIs used by agents,
CLIs, MCP servers, webhooks, chat integrations, and automation. No critical factory
operation may exist only as a UI action.

## 4. Factory-as-code contract

### 4.1 Repository layout

```text
factory/
  factory.yaml
  agents/
    triage.yaml
    spec.yaml
    implementation.yaml
    verification.yaml
    review.yaml
    deployment.yaml
    monitoring.yaml
    improvement.yaml
  workflows/
    issue-to-pr.workflow.json
    pr-repair.workflow.json
    incident-fix.workflow.json
  skills/
  tools/
  connectors/
  policies/
  routing/
    models.yaml
    queues.yaml
  scorers/
  benchmarks/
    suites/
    fixtures/
    rubrics/
  environments/
  tests/
```

### 4.2 `factory.yaml`

The manifest should declare:

- Factory identity, schema version, owners, products, repositories, and environments
- Referenced workflow definitions and demand-entry routes
- Agent roles, capabilities, allowed tools, model routes, budgets, and concurrency
- Skills, MCP servers, connector requirements, and environment bindings
- Queue priorities, escalation paths, service objectives, and stop conditions
- Scorer definitions, dimensions, sampling schedules, and evidence requirements
- Benchmark suites, configuration variants, promotion criteria, and control groups
- Human approval policy and protected-environment rules
- Retention, redaction, data-classification, residency, and audit policy
- Rollout, rollback, canary, and factory-version compatibility settings

Every runtime run pins the commit and content digest of the entire resolved factory
configuration. Includes are resolved before execution, validated, and stored as an
immutable release bundle.

### 4.3 Definition guarantees

- JSON Schema or Zod validates every manifest and dependent document.
- References are explicit and content-addressed in release bundles.
- Secrets and credentials are referenced, never embedded.
- Agent tools use typed request/response schemas.
- Models are selected through routing aliases rather than hard-coded in prompts.
- Agent definitions declare maximum cost, time, turns, retries, and human touchpoints.
- Scorers declare rubric version, evidence inputs, judge type, and calibration set.
- Migrations preserve the ability to inspect and reproduce historical releases.

## 5. Core factory domain model

| Entity | Purpose |
| --- | --- |
| Factory | Team-owned automation system spanning products and repositories |
| Factory version | Immutable resolved configuration built from a source commit |
| Demand item | Issue, incident, request, opportunity, or maintenance trigger |
| Work package | Approved outcome, constraints, acceptance tests, and risk class |
| Factory run | End-to-end attempt to progress one work package |
| Stage run | Triage, spec, implement, verify, review, deploy, or monitor execution |
| Agent run | One agent session with pinned model, prompt, skills, tools, and budget |
| Human touchpoint | A request, decision, edit, comment, takeover, or approval |
| Evidence bundle | Traces, diffs, tests, reviews, telemetry, costs, and outcomes |
| Score | Rubric-versioned grade over an evidence bundle |
| Improvement candidate | Pattern, hypothesis, proposed factory diff, and expected effect |
| Benchmark | Controlled comparison of factory variants over reference tasks |
| Promotion | Approved movement of a factory version into an environment |

All entities share factory, version, product, repository, demand, run, stage, agent,
trace, cost, and actor correlation identifiers.

## 6. API-first execution engine

Expose stable, authenticated APIs for:

- Validate, resolve, package, diff, and release factory definitions
- Create, queue, pause, steer, resume, cancel, and inspect factory runs
- Start or signal individual stages and agents
- Retrieve streaming events, traces, histories, artifacts, costs, and human actions
- Register, test, bind, rotate, and revoke data connections
- Submit human decisions and approvals
- Define, schedule, execute, and retrieve scorer results
- Create benchmark suites, execute variants, compare results, and record decisions
- Create improvement candidates and open source-control proposals
- Promote, canary, rollback, and retire factory versions

The React application, CLI, MCP tools, chat integrations, and scheduled automation
must all consume these APIs. API contracts are versioned, idempotent where mutating,
and emit audit records.

## 7. Reference SDLC factory

### 7.1 Demand intake

Normalize GitHub issues, backlog items, incidents, dependency updates, product
requests, and scheduled maintenance into a typed demand item.

The intake stage:

- De-duplicates and correlates related demand
- Identifies product, repository, ownership, urgency, and risk
- Redacts or labels sensitive data
- Estimates required capabilities and expected cost
- Determines whether the item should be rejected, clarified, grouped, or admitted

### 7.2 Triage

The triage agent reproduces or validates the problem, gathers code and operational
context, classifies the work, and proposes the next stage. It cannot modify product
code.

Exit evidence:

- Reproduction or validation result
- Scope and likely ownership
- Risk and data classification
- Recommended route with confidence
- Missing information or explicit rejection reason

### 7.3 Specification

The specification agent produces a work package:

- User or system outcome
- Current and desired behavior
- Acceptance criteria and non-goals
- Architecture constraints and affected interfaces
- Security, privacy, migration, rollout, and observability requirements
- Test and evaluation strategy
- Estimated budget and required approvals

Ambiguous or high-risk work pauses for human clarification or approval.

### 7.4 Implementation

The implementation agent works in an isolated cloud development environment:

- Creates a branch/worktree from a pinned base
- Reads repository instructions and relevant context
- Makes bounded changes
- Adds or updates tests and documentation
- Runs allowed validation commands
- Produces a commit and pull request with evidence

It cannot bypass branch policy, expose credentials, or expand scope without a new
proposal.

### 7.5 Verification and review

Independent agents verify:

- Acceptance criteria and regression behavior
- Tests, build, lint, type safety, and replay compatibility
- Security, privacy, dependency, and secret-handling constraints
- Operational readiness, telemetry, rollout, and rollback
- Diff scope and evidence grounding

Verifier and reviewer agents should not share hidden implementation context beyond
the recorded work package and artifacts; this preserves independent evaluation.

### 7.6 Delivery and monitoring

Deployment stages respect existing CI/CD and approval systems. After release, a
monitoring agent evaluates declared product signals, errors, regressions, and rollback
criteria for a bounded observation window.

The factory run is not successful merely because a pull request merged. Success
requires the configured product outcome or a clearly defined proxy.

## 8. Observability and evidence architecture

### 8.1 Event spine

Every control-plane and execution-plane action emits a structured event:

- Demand admitted, rejected, clarified, or reclassified
- Stage and agent queued, started, steered, paused, resumed, completed, or failed
- Tool and connector requested, authorized, called, retried, and completed
- Artifact created, read, redacted, expired, or promoted
- Human input requested and supplied
- Score requested and produced
- Improvement proposed, reviewed, merged, rejected, or reverted
- Benchmark scheduled, variant completed, and decision recorded
- Factory version validated, released, promoted, canaried, or rolled back

Events feed immutable audit storage, OpenTelemetry, analytical projections, live UI
updates, and scorer evidence bundles.

### 8.2 Agent trace

Retain, subject to policy:

- Pinned factory/agent/model/prompt/skill/tool versions
- Inputs, outputs, reasoning-safe summaries, and tool calls
- Code changes, commands, test results, review comments, and human steering
- Token use, model/provider cost, compute time, queue delay, and wall-clock time
- Policy decisions, redactions, errors, retries, and termination reason

Do not require private chain-of-thought. Improvement must rely on observable inputs,
actions, outputs, decisions, and outcomes.

### 8.3 Dashboard views

- **Factory overview:** output, cost, automation, quality, backlog, and trend lines
- **Flow view:** demand progressing across stages, waits, failures, and bottlenecks
- **Run explorer:** correlated stage/agent timeline with artifacts and human actions
- **Agent/model matrix:** outcomes and economics by role, model, skill, and task class
- **Scorer view:** distributions, failure clusters, calibration, and disagreement
- **Improvement inbox:** evidence-backed hypotheses and proposed definition diffs
- **Benchmark lab:** tasks, variants, results matrix, significance, and recommendation
- **Connections:** health, scopes, use, failures, rotation, cost, and affected runs
- **Factory releases:** source diff, benchmark evidence, rollout, health, and rollback

## 9. Factory metrics and economics

### 9.1 Core outcome metrics

| Metric | Definition |
| --- | --- |
| PR throughput | Eligible factory PRs merged per unit time, segmented by task class |
| Average cost per merged PR | Model, compute, scorer, and allocated platform cost divided by merged PRs |
| Automation percentage | Eligible stage transitions completed without a human touchpoint |
| Human touchpoints per PR | Count of substantive requests, edits, steering actions, takeovers, and approvals |
| Human active time per PR | Estimated or measured active minutes, separate from wait time |
| Savings estimate | Comparable human baseline cost minus factory operating cost |
| Product acceleration | Change in validated product outcomes or lead time attributable to the factory |

### 9.2 Guardrail metrics

- Change failure, rollback, revert, escaped-defect, and incident rates
- Acceptance-criteria pass rate and reviewer override rate
- Security/privacy policy violations and secret exposure
- False-success and false-rejection rates
- Time to human escalation and time waiting for decisions
- Model/tool error, retry, timeout, and nontermination rates
- Scorer agreement, calibration, drift, and cost
- Factory-definition rollback rate

### 9.3 Flow and efficiency metrics

- Demand admission and completion rate
- End-to-end lead time and stage cycle time
- Queue delay, work in progress, abandonment, and rework
- First-pass verification/review success
- Cost and latency by task class, repository, stage, agent, and model
- Tool calls and context volume per successful outcome
- Connection failure and throttling contribution
- Benchmark win rate and realized post-promotion improvement

Metrics must always be segmented by task type and risk. Optimizing a blended average
can hide quality degradation or a shift toward easier work.

## 10. Scorers and observers

### 10.1 Scorer contract

A scorer receives a versioned evidence bundle and produces:

- Dimension and rubric version
- Numeric or categorical grade
- Explanation grounded in evidence references
- Confidence and missing-evidence flags
- Judge identity: deterministic code, human, model, or ensemble
- Cost, latency, and calibration metadata

### 10.2 Initial score dimensions

- Triage routing correctness
- Reproduction and root-cause quality
- Specification completeness and ambiguity
- Acceptance-criteria satisfaction
- Test adequacy and regression protection
- Code correctness, maintainability, and scope discipline
- Security, privacy, and policy compliance
- Review precision and recall
- Operational readiness and observability
- Cost efficiency, latency, verbosity, and human burden
- Product outcome after deployment

### 10.3 Scoring strategy

- Run deterministic scorers on every eligible run.
- Run inexpensive model scorers broadly.
- Sample expensive or expert scorers based on risk, novelty, and uncertainty.
- Oversample failures, disagreements, and newly changed factory components.
- Maintain human-labeled calibration sets.
- Measure judge drift and inter-rater agreement.
- Prevent the same model configuration from being the sole implementer and judge for
  high-risk work.
- Store rubric changes as factory code and never compare scores across incompatible
  rubric versions without normalization.

Observers execute on schedules and event triggers, assemble evidence bundles, invoke
scorers, and update analytical projections.

## 11. Self-improvement loop

### 11.1 Operating loop

1. Factory agents perform normal product work.
2. Observers assemble complete evidence bundles.
3. Scorers grade individual and grouped runs.
4. An improvement agent analyzes a bounded cohort for repeated failure and success
   patterns.
5. It creates a falsifiable hypothesis tied to a metric and guardrails.
6. It proposes a minimal diff to factory code: prompt, skill, tool, workflow, policy,
   model route, budget, or queue setting.
7. Static validation, tests, replay checks, and offline scoring run.
8. A benchmark compares the candidate with the current baseline when feasible.
9. Humans review evidence and the source diff as a pull request.
10. An approved candidate rolls out to a canary scope.
11. Post-promotion metrics confirm, reject, or revert the change.

### 11.2 Improvement candidate requirements

Every candidate includes:

- Cohort and evidence references
- Observed pattern and estimated prevalence
- Root-cause hypothesis and alternatives considered
- Minimal proposed change
- Primary metric, expected effect size, and guardrails
- Benchmark or evaluation plan
- Rollout, observation period, and rollback trigger
- Known limitations and affected task classes

No candidate may optimize only the scorer it is judged by. Product and operational
guardrails remain authoritative.

## 12. Benchmark system

### 12.1 Benchmark suite

A suite contains:

- Representative, versioned reference tasks
- Repository/base revision or reproducible fixture
- Task class, risk, capabilities, and expected evidence
- Acceptance tests and scorer rubrics
- Allowed time, cost, retries, and human-input simulation
- Data handling and isolation requirements

Suites combine curated tasks, sanitized historical work, regressions from failed
runs, adversarial cases, and unseen holdouts.

### 12.2 Experiment execution

- Change one named configuration dimension where possible.
- Run baseline and candidates on identical task sets in isolated cloud environments.
- Randomize execution order and repeat noisy tasks.
- Pin dependencies except the tested variable.
- Apply the same scorer versions to all variants.
- Report per-task outcomes, aggregates, cost, latency, failures, and confidence.
- Preserve all traces and release bundles for reproduction.

Testable dimensions include model/provider, model routing, prompts, skills, tool sets,
context selection, workflow topology, retry policy, budgets, reviewer independence,
and escalation thresholds.

### 12.3 Promotion policy

A candidate can advance only when:

- The primary metric clears a declared practical threshold.
- Quality, security, product, and cost guardrails do not regress beyond tolerance.
- Results cover enough representative tasks.
- Scorer calibration is acceptable.
- The change passes factory-definition tests.
- A responsible human approves the evidence and diff.

Benchmark success earns a canary, not immediate global promotion.

## 13. Multi-model and multi-agent strategy

- Route by stage, task class, risk, context size, latency target, data policy, and
  historical benchmark performance.
- Keep routing policy in version-controlled factory code.
- Normalize provider interfaces while retaining provider-specific capabilities.
- Record exact provider, model, parameters, harness, and fallback path per run.
- Use specialized agents with narrow permissions rather than one omnipotent agent.
- Allow independent implementation, verification, and review routes.
- Treat model fallback as an explicit policy with cost and quality implications.
- Continuously benchmark new models against representative internal work before use.
- Support shadow execution to score candidates without affecting production.

## 14. Data connection management for the factory

The factory requires governed connections to:

- Source control and pull-request systems
- Issue trackers and product planning tools
- CI/CD, test, artifact, and package systems
- Cloud development environments
- Deployment and feature-management systems
- Logs, metrics, traces, incidents, and customer feedback
- Chat, email, and approval systems
- Model providers and evaluation services

Factory connection policy adds:

- Per-agent and per-stage action allowlists
- Repository, branch, environment, and organization scopes
- Read versus write separation
- Short-lived credentials injected only into isolated activities
- Explicit approval for destructive or production-affecting actions
- Complete tool-call attribution and payload redaction
- Connection health as a first-class cause in run and metric analysis
- Cost attribution for metered tools and model providers

## 15. Progressive outcomes

### Outcome 0: Reproducible workflow substrate

**Capability:** The foundational React/Temporal platform runs one durable,
observable workflow from a versioned definition.

Deliver:

- Canonical workflow schema and compiler
- API-based run lifecycle
- Temporal execution and correlated event spine
- Basic dashboard and managed test connection

Exit gate:

- A run is reproducible from its pinned definition and artifacts.
- UI and CLI perform the same actions through public APIs.
- Restarting control or execution services does not lose run state.

### Outcome 1: Factory definition as code

**Capability:** A team can instantiate a versioned factory release from
`factory.yaml` and dependent definitions.

Deliver:

- Factory schema, resolver, validator, packager, and release bundle
- Git-based review, diff, rollback, and environment promotion
- Agent, workflow, model-route, policy, and connection references
- Source and release views in the dashboard

Exit gate:

- Every factory run pins an immutable release digest.
- A historical release can be validated and instantiated.
- An agent can propose a valid source diff but cannot merge or promote it.

### Outcome 2: Cloud team execution

**Capability:** Triage, specification, implementation, verification, and review run
in persistent cloud infrastructure for a shared repository.

Deliver:

- Demand intake APIs and one issue-to-PR workflow
- Isolated cloud development environments
- Stage-specific agents and permissions
- Human clarification, approval, pause, resume, and escalation
- Source-control, issue, CI, artifact, and chat connections

Exit gate:

- Multiple team members see and steer the same runs.
- Automation continues without a developer laptop.
- One low-risk task class progresses end to end under policy.

### Outcome 3: Complete evidence and baseline metrics

**Capability:** The team can measure factory flow, economics, automation, and quality
from centrally stored evidence.

Deliver:

- Unified demand/factory/stage/agent correlation model
- Trace and artifact retention with redaction
- Human touchpoint capture
- Cost allocation for models, compute, and scoring
- Factory overview, run explorer, flow, and agent/model dashboards
- Baselines for throughput, cost per PR, automation, lead time, and guardrails

Exit gate:

- At least 95% of eligible runs have complete identity, outcome, cost, and touchpoint
  data.
- Metric definitions are documented and reproducible.
- Missing evidence is visible rather than silently excluded.

### Outcome 4: Scored factory

**Capability:** Deterministic, model, and sampled human scorers grade factory runs on
dimensions that predict successful product work.

Deliver:

- Scorer SDK, registry, scheduler, and evidence-bundle service
- Initial correctness, quality, cost, security, and stage-specific rubrics
- Calibration sets and scorer agreement/drift dashboards
- Risk-based sampling and cost controls

Exit gate:

- Scorer versions and evidence references are attached to every grade.
- Calibration meets declared thresholds on a human-labeled set.
- Scorer cost is measured and bounded.

### Outcome 5: Human-approved improvement proposals

**Capability:** Improvement agents convert recurring scored patterns into minimal,
reviewable factory-definition pull requests.

Deliver:

- Cohort analysis and failure-clustering jobs
- Improvement-candidate schema and inbox
- Evidence-linked factory diff generation
- Static validation, definition tests, and offline evaluation
- Pull-request workflow with responsible-owner approval

Exit gate:

- Every proposal has a falsifiable hypothesis, target metric, guardrails, and rollback
  plan.
- No agent can directly change a protected factory release.
- Humans can reject proposals and feed reasons back into future analysis.

### Outcome 6: Benchmark-driven decisions

**Capability:** Teams compare factory configurations on representative internal tasks
before promotion.

Deliver:

- Benchmark suite format and task-fixture lifecycle
- Parallel variant runner in isolated environments
- Result matrix, statistical summary, cost comparison, and synthesis
- Historical regression suites and unseen holdouts
- Candidate-to-canary promotion workflow

Exit gate:

- Benchmark runs are reproducible from release and suite digests.
- Baseline and candidates receive identical tasks and scorer versions.
- At least one model/routing or skill decision is made from benchmark evidence.

### Outcome 7: Controlled closed loop

**Capability:** Evidence creates proposals, benchmarks qualify them, and measured
canaries promote or revert them with human guidance.

Deliver:

- Scheduled observe-score-improve-benchmark cycle
- Canary scopes by repository, task class, and traffic percentage
- Post-promotion comparison and automatic rollback recommendation
- Drift detection for models, tools, repositories, scorers, and task mix
- Improvement accounting from hypothesis through realized effect

Exit gate:

- The system demonstrates repeated, measured improvement across multiple cycles.
- Quality and security guardrails remain stable or improve.
- Every active factory change is attributable to evidence, review, and a release.

### Outcome 8: Product-aligned factory portfolio

**Capability:** Multiple teams operate factories as managed internal products and can
compare investment, reuse, and outcomes without compromising isolation.

Deliver:

- Multi-factory tenancy, quotas, ownership, and reusable components
- Portfolio metrics segmented by product and task class
- Shared benchmark/scorer/skill catalog with provenance
- Capacity and model-provider optimization
- Product outcome integrations beyond merged pull requests

Exit gate:

- Teams can independently release factories under common governance.
- Shared components have compatibility and deprecation policies.
- Investment decisions use factory economics plus product outcomes, not activity
  volume alone.

## 16. Rollout sequence

Start with one team, one repository, one low-risk task class, and one issue-to-PR
workflow.

1. Run in shadow mode and capture complete evidence.
2. Permit triage/specification output only; humans continue implementation.
3. Permit agent implementation with mandatory human review.
4. Add independent verification and review agents.
5. Allow policy-compliant pull-request creation.
6. Establish stable metric baselines before optimizing.
7. Introduce scorers and calibrate them against human judgments.
8. Allow improvement agents to open factory-definition pull requests.
9. Add benchmarks and canary factory releases.
10. Expand task classes, repositories, and teams only after exit gates hold.

Do not automate merges or deployments merely to increase automation percentage.
Human touchpoints should be removed only when evidence shows that quality and risk do
not regress.

## 17. Initial vertical slices

### Slice A: Issue to reviewed proposal

Issue webhook -> normalize -> triage -> specification -> human approval -> end.

Proves intake, team visibility, version pinning, evidence, and human signals.

### Slice B: Issue to pull request

Approved work package -> isolated implementation -> tests -> independent verification
-> pull request -> human review.

Proves cloud execution, repository connections, stage permissions, and end-to-end
cost/touchpoint tracking.

### Slice C: Scored run

Completed factory run -> evidence bundle -> deterministic checks -> model scorer ->
score dashboard.

Proves rubric versioning, scorer scheduling, calibration workflow, and scoring cost.

### Slice D: Improvement proposal

Cohort of scored runs -> pattern hypothesis -> minimal prompt/skill/routing diff ->
factory-definition pull request.

Proves that agents can improve factory code only through reviewable proposals.

### Slice E: Benchmark and canary

Baseline plus one candidate -> representative tasks -> shared scorers -> comparison ->
human decision -> canary -> post-promotion analysis.

Proves the complete evidence-to-improvement loop.

## 18. Operating cadence

### Continuous

- Execute factory work, collect traces, enforce policy, and update operational alerts.

### Every few hours

- Score new eligible runs according to configured sampling and risk.
- Detect missing evidence, stuck runs, budget anomalies, and connection failures.

### Daily

- Review failed and escalated runs.
- Review scorer disagreement and high-cost cohorts.
- Triage urgent improvement candidates.

### Weekly

- Review throughput, cost, automation, quality, task mix, and bottlenecks.
- Select improvement hypotheses and benchmark candidates.
- Refresh reference tasks from new failures while protecting holdouts.

### Per factory release

- Validate, test, benchmark as required, review, canary, observe, and promote or
  rollback.

### Monthly

- Recalibrate scorers, revisit human baselines, audit permissions and connections,
  review model/provider performance, and assess realized product outcomes.

## 19. Anti-goals and failure modes

- **UI-first factory:** prevents agents and integrations from operating the system.
- **Mutable configuration:** destroys reproducibility and trustworthy measurement.
- **Local-only execution:** breaks automation availability, shared evidence, and team
  operation.
- **One universal agent:** expands permissions and obscures stage-specific quality.
- **PR count as success:** rewards trivial changes and ignores product outcomes.
- **Automation percentage alone:** encourages removal of valuable oversight.
- **LLM judge without calibration:** creates circular, unstable optimization.
- **Self-modification without review:** turns errors and metric gaming into production
  behavior.
- **Benchmarks drawn only from training history:** overfit the factory and overstate
  progress.
- **Missing failures excluded from metrics:** creates success-shaped telemetry.
- **Credentials in agent context:** makes the factory an exfiltration path.
- **Merged PR as terminal state:** misses deployment failures and product regressions.

## 20. Definition of a closed-loop release

The first closed-loop FACTORY release is complete when:

- A factory is fully defined in version-controlled code and released immutably.
- Its cloud runtime is operable through stable APIs and the React dashboard.
- One representative demand class flows through specialized agents to a reviewed pull
  request.
- Run traces, costs, human touchpoints, artifacts, outcomes, and connection use are
  centrally correlated.
- Calibrated scorers grade completed runs.
- An improvement agent can identify a scored pattern and open a minimal,
  evidence-linked factory-definition pull request.
- A benchmark compares that candidate with the current baseline.
- A human can approve a canary release and observe whether the predicted improvement
  occurs.
- The system recommends rollback when guardrails regress.
- At no point can an agent silently modify or promote the protected factory.
