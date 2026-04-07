import type Database from 'better-sqlite3';
import type { Emitter } from '../project-emitter.js';
import type { DeployStatus, DeployEnvironment } from '../../shared/api-types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('deploy');

export interface DeployRecord {
  environment: DeployEnvironment;
  status: DeployStatus;
  commit_sha: string | null;
  branch: string | null;
  pr_number: number | null;
  health_check_url: string | null;
  details: Record<string, unknown> | null;
}

export interface DeployRow {
  id: number;
  environment: DeployEnvironment;
  status: DeployStatus;
  commit_sha: string | null;
  branch: string | null;
  pr_number: number | null;
  health_check_url: string | null;
  started_at: string | null;
  completed_at: string | null;
  details: string;
}

export class DeployService {
  constructor(
    private db: Database.Database,
    private io: Emitter
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
    log.info('Deploy recorded', { id, env: deploy.environment, status: deploy.status, commit_sha: deploy.commit_sha, branch: deploy.branch });
    const inserted = this.db.prepare('SELECT * FROM deployments WHERE id = ?').get(id);
    if (inserted) {
      this.io.emit('deploy:updated', inserted);
    }

    return id;
  }

  /** Update deployment status */
  updateStatus(id: number, status: DeployStatus, details?: string): void {
    const completedAt = (status === 'healthy' || status === 'failed' || status === 'rolled-back')
      ? new Date().toISOString()
      : null;

    this.db.prepare(
      `UPDATE deployments SET status = ?, completed_at = COALESCE(?, completed_at), details = COALESCE(?, details) WHERE id = ?`
    ).run(status, completedAt, details, id);

    log.info('Deploy status updated', { id, status });
    const updated = this.db.prepare('SELECT * FROM deployments WHERE id = ?').get(id);
    if (updated) {
      this.io.emit('deploy:updated', updated);
    }
  }

  /** Get recent deployments */
  getRecent(limit: number = 20): DeployRow[] {
    return this.db
      .prepare('SELECT * FROM deployments ORDER BY started_at DESC LIMIT ?')
      .all(limit) as DeployRow[];
  }

  /** Get latest deployment per environment */
  getLatestPerEnv(): DeployRow[] {
    return this.db.prepare(`
      SELECT * FROM deployments
      WHERE id IN (
        SELECT MAX(id) FROM deployments GROUP BY environment
      )
      ORDER BY environment
    `).all() as DeployRow[];
  }
}
