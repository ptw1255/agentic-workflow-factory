import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createApp } from '../src/server/app.js';

const directory = await mkdtemp(path.join(os.tmpdir(), 'agentic-factory-demo-'));
const app = await createApp({
  dataFile: path.join(directory, 'state.json'),
  serveStatic: false,
});

const workflowsResponse = await app.inject({
  method: 'GET',
  url: '/api/workflows',
});
const workflows = workflowsResponse.json<{ items: Array<{ id: string }> }>().items;
const workflow = workflows[0];
if (workflow === undefined) {
  throw new Error('Demo workflow was not seeded.');
}

const runResponse = await app.inject({
  method: 'POST',
  url: `/api/workflows/${workflow.id}/runs`,
  payload: {},
});
const run = runResponse.json<{ id: string }>();

await new Promise((resolve) => setTimeout(resolve, 100));
const completedResponse = await app.inject({
  method: 'GET',
  url: `/api/runs/${run.id}`,
});
const eventsResponse = await app.inject({
  method: 'GET',
  url: `/api/events?runId=${run.id}`,
});

console.log(
  JSON.stringify(
    {
      run: completedResponse.json(),
      events: eventsResponse.json<{ items: unknown[] }>().items.length,
    },
    null,
    2,
  ),
);

await app.close();
