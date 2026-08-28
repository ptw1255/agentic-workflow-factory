import { fileURLToPath } from 'node:url';

import { NativeConnection, Worker } from '@temporalio/worker';

import * as activities from './activities.js';

const address = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';
const namespace = process.env.TEMPORAL_NAMESPACE ?? 'default';
const taskQueue = process.env.TEMPORAL_TASK_QUEUE ?? 'agentic-workflows';
const connection = await NativeConnection.connect({ address });
const worker = await Worker.create({
  connection,
  namespace,
  taskQueue,
  workflowsPath: fileURLToPath(new URL('./workflows.ts', import.meta.url)),
  activities,
});

await worker.run();
