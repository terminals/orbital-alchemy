import { execFile as execFileCb, spawn } from 'child_process';
import { promisify } from 'util';

// Uses execFile (not exec) — safe against shell injection
const execFile = promisify(execFileCb);

// ─── Types ──────────────────────────────────────────────────

export interface GitHubStatus {
  connected: boolean;
  authUser: string | null;
  repo: {
    owner: string;
    name: string;
    fullName: string;
    defaultBranch: string;
    visibility: string;
    url: string;
  } | null;
  openPRs: number;
  error: string | null;
}

export interface PullRequestInfo {
  number: number;
  title: string;
  author: string;
  branch: string;
  baseBranch: string;
  state: string;
  url: string;
  createdAt: string;
  scopeIds: number[];
}

// ─── Service ────────────────────────────────────────────────

const CACHE_TTL = 30_000; // 30 seconds
const SCOPE_ID_RE = /(?:scope|feat)[/-](\d+)/gi;

export class GitHubService {
  private statusCache: { data: GitHubStatus; ts: number } | null = null;
  private prCache: { data: PullRequestInfo[]; ts: number } | null = null;

  constructor(private projectRoot: string) {}

  private async gh(args: string[]): Promise<string> {
    const { stdout } = await execFile('gh', args, {
      cwd: this.projectRoot,
      timeout: 10_000,
    });
    return stdout;
  }

  private async ghAvailable(): Promise<boolean> {
    try {
      await execFile('which', ['gh']);
      return true;
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<GitHubStatus> {
    if (this.statusCache && Date.now() - this.statusCache.ts < CACHE_TTL) {
      return this.statusCache.data;
    }

    const available = await this.ghAvailable();
    if (!available) {
      const result: GitHubStatus = {
        connected: false,
        authUser: null,
        repo: null,
        openPRs: 0,
        error: 'gh CLI not installed',
      };
      this.statusCache = { data: result, ts: Date.now() };
      return result;
    }

    // Check auth
    let authUser: string | null = null;
    try {
      const whoami = await this.gh(['api', 'user', '--jq', '.login']);
      authUser = whoami.trim() || null;
    } catch {
      const result: GitHubStatus = {
        connected: false,
        authUser: null,
        repo: null,
        openPRs: 0,
        error: 'gh not authenticated — run `gh auth login`',
      };
      this.statusCache = { data: result, ts: Date.now() };
      return result;
    }

    // Get repo info
    let repo: GitHubStatus['repo'] = null;
    try {
      const raw = await this.gh([
        'repo', 'view', '--json', 'owner,name,defaultBranchRef,visibility,url',
      ]);
      const parsed = JSON.parse(raw);
      repo = {
        owner: parsed.owner?.login ?? '',
        name: parsed.name ?? '',
        fullName: `${parsed.owner?.login ?? ''}/${parsed.name ?? ''}`,
        defaultBranch: parsed.defaultBranchRef?.name ?? 'main',
        visibility: (parsed.visibility ?? 'private').toLowerCase(),
        url: parsed.url ?? '',
      };
    } catch {
      const result: GitHubStatus = {
        connected: false,
        authUser,
        repo: null,
        openPRs: 0,
        error: 'Not a GitHub repository',
      };
      this.statusCache = { data: result, ts: Date.now() };
      return result;
    }

    // Get open PR count
    let openPRs = 0;
    try {
      const raw = await this.gh(['pr', 'list', '--state', 'open', '--json', 'number', '--limit', '100']);
      const parsed = JSON.parse(raw);
      openPRs = Array.isArray(parsed) ? parsed.length : 0;
    } catch { /* ok */ }

    const result: GitHubStatus = { connected: true, authUser, repo, openPRs, error: null };
    this.statusCache = { data: result, ts: Date.now() };
    return result;
  }

  async getOpenPRs(): Promise<PullRequestInfo[]> {
    if (this.prCache && Date.now() - this.prCache.ts < CACHE_TTL) {
      return this.prCache.data;
    }

    try {
      const raw = await this.gh([
        'pr', 'list', '--state', 'open', '--json',
        'number,title,author,headRefName,baseRefName,state,url,createdAt,updatedAt,reviewDecision',
        '--limit', '30',
      ]);
      const parsed = JSON.parse(raw);

      const prs: PullRequestInfo[] = (parsed as Array<Record<string, unknown>>).map(pr => {
        const title = String(pr.title ?? '');
        const branch = String(pr.headRefName ?? '');
        const scopeIds: number[] = [];
        const sources = `${title} ${branch}`;
        let m: RegExpExecArray | null;
        SCOPE_ID_RE.lastIndex = 0;
        while ((m = SCOPE_ID_RE.exec(sources)) !== null) {
          const id = parseInt(m[1]);
          if (!scopeIds.includes(id)) scopeIds.push(id);
        }

        return {
          number: Number(pr.number),
          title,
          author: typeof pr.author === 'object' && pr.author ? String((pr.author as Record<string, unknown>).login ?? '') : '',
          branch,
          baseBranch: String(pr.baseRefName ?? ''),
          state: String(pr.state ?? ''),
          url: String(pr.url ?? ''),
          createdAt: String(pr.createdAt ?? ''),
          scopeIds,
          reviewDecision: (pr.reviewDecision as string) || null,
          lastActivityAt: String(pr.updatedAt ?? pr.createdAt ?? ''),
        };
      });

      this.prCache = { data: prs, ts: Date.now() };
      return prs;
    } catch {
      return [];
    }
  }

  // ─── Auth Flow ─────────────────────────────────────────────

  /** Start OAuth flow via gh CLI — opens browser. Client polls getAuthStatus(). */
  async connectOAuth(): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      // spawn is safe here: no shell, args are hardcoded literals
      const child = spawn('gh', ['auth', 'login', '--web', '--git-protocol', 'https'], {
        cwd: this.projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stderr = '';
      child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

      // Resolve quickly — the gh process runs in background, client polls auth status
      setTimeout(() => {
        resolve({ success: true });
      }, 500);

      child.on('error', () => {
        resolve({ success: false, error: stderr || 'Failed to start auth flow' });
      });
    });
  }

  /** Authenticate using a Personal Access Token piped to gh stdin. */
  async connectWithToken(token: string): Promise<{ success: boolean; error?: string }> {
    try {
      // spawn is safe: no shell, args are hardcoded literals, token via stdin (not args)
      const child = spawn('gh', ['auth', 'login', '--with-token'], {
        cwd: this.projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      return new Promise((resolve) => {
        let stderr = '';
        child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

        child.on('close', (code) => {
          this.clearCaches();
          if (code === 0) {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: stderr || 'Authentication failed' });
          }
        });

        child.on('error', () => {
          resolve({ success: false, error: 'Failed to run gh auth' });
        });

        child.stdin?.write(token);
        child.stdin?.end();
      });
    } catch {
      return { success: false, error: 'Failed to authenticate' };
    }
  }

  /** Lightweight auth check — returns current user if authenticated. */
  async getAuthStatus(): Promise<{ authenticated: boolean; user?: string }> {
    try {
      const whoami = await this.gh(['api', 'user', '--jq', '.login']);
      const user = whoami.trim();
      return user ? { authenticated: true, user } : { authenticated: false };
    } catch {
      return { authenticated: false };
    }
  }

  /** Log out of GitHub CLI. */
  async disconnect(): Promise<{ success: boolean; error?: string }> {
    try {
      // execFile is safe — no shell injection
      await execFile('gh', ['auth', 'logout', '--hostname', 'github.com'], {
        cwd: this.projectRoot,
        timeout: 10_000,
        env: { ...process.env, GH_PROMPT_DISABLED: '1' },
      });
      this.clearCaches();
      return { success: true };
    } catch (err) {
      this.clearCaches();
      return { success: false, error: String(err) };
    }
  }

  // ─── CI Checks ─────────────────────────────────────────────

  /** Fetch GitHub Actions check runs for a commit ref. */
  async getCheckRuns(ref: string): Promise<Array<{ name: string; status: string; conclusion: string | null; url: string }>> {
    // Validate ref to prevent path traversal — only allow hex SHA and branch-like names
    if (!/^[a-zA-Z0-9._/-]+$/.test(ref)) return [];

    try {
      const raw = await this.gh([
        'api', `repos/{owner}/{repo}/commits/${ref}/check-runs`,
        '--jq', '.check_runs | map({name, status, conclusion, html_url})',
      ]);
      const parsed = JSON.parse(raw);
      return (parsed as Array<Record<string, unknown>>).map(c => ({
        name: String(c.name ?? ''),
        status: String(c.status ?? 'queued'),
        conclusion: c.conclusion ? String(c.conclusion) : null,
        url: String(c.html_url ?? ''),
      }));
    } catch {
      return [];
    }
  }

  private clearCaches(): void {
    this.statusCache = null;
    this.prCache = null;
  }
}
