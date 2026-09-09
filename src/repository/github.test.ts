import { describe, expect, it, vi } from 'vitest';
import { GitHubRepositoryClient } from './github.js';

describe('GitHubRepositoryClient', () => {
  it('creates a pull request without exposing the token in the payload', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ number: 7, html_url: 'https://github.com/example/repo/pull/7', head: { ref: 'feature' }, base: { ref: 'main' }, state: 'open' }), { status: 201 }));
    const result = await new GitHubRepositoryClient({ token: 'secret-token', owner: 'example', repo: 'repo', fetcher }).createPullRequest({ title: 'What', body: 'Why', head: 'feature', base: 'main' });
    expect(result).toMatchObject({ number: 7, head: 'feature', base: 'main' });
    expect(String(fetcher.mock.calls[0]?.[1]?.body)).not.toContain('secret-token');
  });
});
