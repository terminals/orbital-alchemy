import type Database from 'better-sqlite3';
import type { Server } from 'socket.io';

export interface DeployRecord {
  environment: 'staging' | 'production';
  status: 'deploying' | 'healthy' | 'failed' | 'rolled-back';
  commit_sha: string | null;
  branch: string | null;
  pr_number: number | null;
  health_check_url: string | null;
  details: Record<string, unknown> | null;
}

export class DeployService {
  constructor(
    private db: Database.Database,
    private io: Server
  ) {}

  /** Record a deployment event */
  record(deploy: DeployRecord): number {
    const now = new Date().toISOString();
    const result = this.db.prepare(
      `INSERT INTO deployments (environment, status, commit_sha, branch, pr_number, health_check_url, started_at, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      deploy.environment,
      deploy.status,
      deploy.commit_sha,
      deploy.branch,
      deploy.pr_number,
      deploy.health_check_url,
      now,
      JSON.stringify(deploy.details ?? {})
    );

    const id = result.lastInsertRowid as number;
    const inserted = this.db.prepare('SELECT * FROM deployments WHERE id = ?').get(id);
    if (inserted) {
      this.io.emit('deploy:updated', inserted);
    }

    return id;
  }

  /** Update deployment status */
  updateStatus(id: number, status: string, details?: string): void {
    const completedAt = (status === 'healthy' || status === 'failed' || status === 'rolled-back')
      ? new Date().toISOString()
      : null;

    this.db.prepare(
      `UPDATE deployments SET status = ?, completed_at = COALESCE(?, completed_at), details = COALESCE(?, details) WHERE id = ?`
    ).run(status, completedAt, details, id);

    const updated = this.db.prepare('SELECT * FROM deployments WHERE id = ?').get(id);
    if (updated) {
      this.io.emit('deploy:updated', updated);
    }
  }

  /** Get recent deployments */
  getRecent(limit: number = 20): unknown[] {
    return this.db
      .prepare('SELECT * FROM deployments ORDER BY started_at DESC LIMIT ?')
      .all(limit);
  }

  /** Get latest deployment per environment */
  getLatestPerEnv(): unknown[] {
    return this.db.prepare(`
      SELECT * FROM deployments
      WHERE id IN (
        SELECT MAX(id) FROM deployments GROUP BY environment
      )
      ORDER BY environment
    `).all();
  }
}
