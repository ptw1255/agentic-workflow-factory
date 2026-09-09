export interface PullRequestInput { title: string; body: string; head: string; base: string }
export interface PullRequest { number: number; url: string; head: string; base: string; state: string }

export interface GitHubClientOptions { token: string; owner: string; repo: string; fetcher?: typeof fetch }

export class GitHubRepositoryClient {
  private readonly fetcher: typeof fetch;
  public constructor(private readonly options: GitHubClientOptions) { this.fetcher = options.fetcher ?? fetch; }

  public async createPullRequest(input: PullRequestInput): Promise<PullRequest> {
    const response = await this.fetcher(`https://api.github.com/repos/${encodeURIComponent(this.options.owner)}/${encodeURIComponent(this.options.repo)}/pulls`, {
      method: 'POST',
      headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${this.options.token}`, 'content-type': 'application/json', 'x-github-api-version': '2022-11-28' },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`GitHub pull request creation failed with status ${response.status}.`);
    const body = await response.json() as { number?: unknown; html_url?: unknown; head?: { ref?: unknown }; base?: { ref?: unknown }; state?: unknown };
    if (typeof body.number !== 'number' || typeof body.html_url !== 'string') throw new Error('GitHub response did not contain pull request metadata.');
    return { number: body.number, url: body.html_url, head: typeof body.head?.ref === 'string' ? body.head.ref : input.head, base: typeof body.base?.ref === 'string' ? body.base.ref : input.base, state: typeof body.state === 'string' ? body.state : 'open' };
  }
}
