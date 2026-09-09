import { execFile } from 'node:child_process';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_OUTPUT = 20_000;
const ALLOWED_CHECKS = new Set(['npm test', 'npm run typecheck', 'npm run build']);

export interface RepositoryEntry { path: string; kind: 'file' | 'directory'; size?: number }
export interface CheckResult { command: string; exitCode: number; durationMs: number; output: string; timedOut: boolean }

function truncate(value: string): string { return value.length > MAX_OUTPUT ? `${value.slice(0, MAX_OUTPUT)}\n… output truncated` : value; }

export class RepositoryWorkspace {
  private constructor(private readonly root: string) {}

  public static async open(root: string): Promise<RepositoryWorkspace> {
    const resolved = await realpath(root);
    if (!(await stat(resolved)).isDirectory()) throw new Error('Repository workspace must be a directory.');
    return new RepositoryWorkspace(resolved);
  }

  public get path(): string { return this.root; }

  public async read(relativePath: string): Promise<string> {
    return readFile(this.safePath(relativePath), 'utf8');
  }

  public async list(relativePath = '.'): Promise<RepositoryEntry[]> {
    const directory = this.safePath(relativePath);
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(directory, { withFileTypes: true });
    return Promise.all(entries.filter((entry) => !['.git', 'node_modules'].includes(entry.name)).map(async (entry) => {
      const entryPath = path.join(relativePath, entry.name);
      return entry.isDirectory() ? { path: entryPath, kind: 'directory' as const } : { path: entryPath, kind: 'file' as const, size: (await stat(this.safePath(entryPath))).size };
    }));
  }

  public async diff(): Promise<string> {
    const result = await execFileAsync('git', ['-C', this.root, 'diff', '--no-ext-diff', '--'], { maxBuffer: MAX_OUTPUT * 2 });
    return truncate(`${result.stdout}${result.stderr}`);
  }

  public async runCheck(command: string, timeoutMs = 120_000): Promise<CheckResult> {
    if (!ALLOWED_CHECKS.has(command)) throw new Error(`Unsupported repository check "${command}".`);
    const started = Date.now();
    try {
      const result = await execFileAsync(command.split(' ')[0]!, command.split(' ').slice(1), { cwd: this.root, timeout: timeoutMs, maxBuffer: MAX_OUTPUT * 2 });
      return { command, exitCode: 0, durationMs: Date.now() - started, output: truncate(`${result.stdout}${result.stderr}`), timedOut: false };
    } catch (error) {
      const failure = error as { code?: number | string; killed?: boolean; stdout?: string; stderr?: string; message?: string };
      return { command, exitCode: typeof failure.code === 'number' ? failure.code : 1, durationMs: Date.now() - started, output: truncate(`${failure.stdout ?? ''}${failure.stderr ?? failure.message ?? ''}`), timedOut: failure.killed === true };
    }
  }

  private safePath(relativePath: string): string {
    const resolved = path.resolve(this.root, relativePath);
    if (resolved !== this.root && !resolved.startsWith(`${this.root}${path.sep}`)) throw new Error('Repository path escapes the workspace boundary.');
    return resolved;
  }
}
