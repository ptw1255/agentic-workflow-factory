import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createSeedState } from '../domain/seed.js';
import type { PlatformState } from '../domain/types.js';

type StateMutation<T> = (state: PlatformState) => T | Promise<T>;

export class JsonStore {
  private state: PlatformState | undefined;
  private loadPromise: Promise<PlatformState> | undefined;
  private queue: Promise<void> = Promise.resolve();

  public constructor(private readonly filePath: string) {}

  public async read<T>(select: (state: PlatformState) => T): Promise<T> {
    const operation = this.queue.then(async () => select(await this.load()));
    this.queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return structuredClone(await operation);
  }

  public async mutate<T>(mutation: StateMutation<T>): Promise<T> {
    const operation = this.queue.then(async () => {
      const draft = structuredClone(await this.load());
      const result = await mutation(draft);
      await this.persist(draft);
      this.state = draft;
      return result;
    });
    this.queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return structuredClone(await operation);
  }

  private async load(): Promise<PlatformState> {
    if (this.state !== undefined) {
      return this.state;
    }
    this.loadPromise ??= this.loadInitialState();
    this.state = await this.loadPromise;
    return this.state;
  }

  private async loadInitialState(): Promise<PlatformState> {
    try {
      const contents = await readFile(this.filePath, 'utf8');
      return JSON.parse(contents) as PlatformState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      const seed = createSeedState();
      await this.persist(seed);
      return seed;
    }
  }

  private async persist(state: PlatformState): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, this.filePath);
  }
}
