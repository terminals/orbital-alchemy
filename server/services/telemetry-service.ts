/**
 * Session Telemetry — uploads raw Claude session JSONL files to a remote
 * Cloudflare Worker + R2 endpoint. This entire feature lives in this single
 * file for easy removal.
 */

import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import type Database from 'better-sqlite3';
import { getClaudeSessionsDir } from '../config.js';

export interface TelemetryConfig {
  enabled: boolean;
  url: string;
  headers: Record<string, string>;
}

interface SessionRow {
  id: string;
  claude_session_id: string | null;
  ended_at: string | null;
  telemetry_sent_at: string | null;
}

interface TelemetryResult {
  ok: boolean;
  uploaded: number;
  errors: number;
}

// ─── Service ───────────────────────────────────────────────

export class TelemetryService {
  private lastResult: TelemetryResult | null = null;

  constructor(
    private db: Database.Database,
    private config: TelemetryConfig,
    private projectName: string,
    private projectRoot: string,
  ) {}

  get enabled(): boolean {
    return this.config.enabled && this.config.url.length > 0;
  }

  /** Upload sessions that have changed since last telemetry send. */
  async uploadChangedSessions(): Promise<TelemetryResult> {
    if (!this.enabled) return { ok: true, uploaded: 0, errors: 0 };

    const rows = this.db.prepare(
      `SELECT id, claude_session_id, ended_at, telemetry_sent_at
       FROM sessions
       WHERE claude_session_id IS NOT NULL
         AND (telemetry_sent_at IS NULL OR ended_at > telemetry_sent_at)`
    ).all() as SessionRow[];

    return this.uploadRows(rows);
  }

  /** Force re-upload all sessions regardless of telemetry_sent_at. */
  async uploadAllSessions(): Promise<TelemetryResult> {
    if (!this.enabled) return { ok: true, uploaded: 0, errors: 0 };

    const rows = this.db.prepare(
      `SELECT id, claude_session_id, ended_at, telemetry_sent_at
       FROM sessions
       WHERE claude_session_id IS NOT NULL`
    ).all() as SessionRow[];

    return this.uploadRows(rows);
  }

  /** Ping the remote health endpoint. */
  async testConnection(): Promise<{ ok: boolean; status: number; body: string }> {
    try {
      const res = await fetch(`${this.config.url}/health`, {
        method: 'GET',
        headers: this.config.headers,
        signal: AbortSignal.timeout(10_000),
      });
      const body = await res.text();
      return { ok: res.ok, status: res.status, body };
    } catch (err) {
      return { ok: false, status: 0, body: (err as Error).message };
    }
  }

  getStatus() {
    return {
      enabled: this.enabled,
      url: this.config.url || null,
      lastResult: this.lastResult,
    };
  }

  // ─── Internal ──────────────────────────────────────────────

  private async uploadRows(rows: SessionRow[]): Promise<TelemetryResult> {
    if (rows.length === 0) {
      this.lastResult = { ok: true, uploaded: 0, errors: 0 };
      return this.lastResult;
    }

    const sessionsDir = getClaudeSessionsDir(this.projectRoot);
    const now = new Date().toISOString();
    let uploaded = 0;
    let errors = 0;

    const updateStmt = this.db.prepare(
      'UPDATE sessions SET telemetry_sent_at = ? WHERE id = ?'
    );

    // Deduplicate by claude_session_id (multiple rows can share the same JSONL file)
    const seen = new Set<string>();
    const unique: SessionRow[] = [];
    for (const row of rows) {
      if (row.claude_session_id && !seen.has(row.claude_session_id)) {
        seen.add(row.claude_session_id);
        unique.push(row);
      }
    }

    for (const row of unique) {
      const sessionId = row.claude_session_id!;
      const filePath = path.join(sessionsDir, `${sessionId}.jsonl`);

      if (!fs.existsSync(filePath)) {
        continue;
      }

      try {
        const body = fs.readFileSync(filePath);
        const encodedProject = encodeURIComponent(this.projectName);
        const url = `${this.config.url}/upload/${encodedProject}/${sessionId}.jsonl`;

        const res = await fetch(url, {
          method: 'PUT',
          body,
          headers: {
            'Content-Type': 'application/x-ndjson',
            ...this.config.headers,
          },
          signal: AbortSignal.timeout(30_000),
        });

        if (res.ok) {
          uploaded++;
          // Update telemetry_sent_at for ALL rows with this claude_session_id
          const matching = rows.filter((r) => r.claude_session_id === sessionId);
          for (const m of matching) {
            updateStmt.run(now, m.id);
          }
        } else {
          errors++;
        }
      } catch {
        errors++;
      }
    }

    this.lastResult = { ok: errors === 0, uploaded, errors };
    return this.lastResult;
  }
}

// ─── Routes ────────────────────────────────────────────────

interface TelemetryRouteDeps {
  telemetryService: TelemetryService;
}

export function createTelemetryRoutes({ telemetryService }: TelemetryRouteDeps): Router {
  const router = Router();

  router.post('/telemetry/trigger', async (req, res) => {
    const force = req.query.force === 'true';
    const result = force
      ? await telemetryService.uploadAllSessions()
      : await telemetryService.uploadChangedSessions();
    res.json(result);
  });

  router.post('/telemetry/test', async (_req, res) => {
    const result = await telemetryService.testConnection();
    res.json(result);
  });

  router.get('/telemetry/status', (_req, res) => {
    res.json(telemetryService.getStatus());
  });

  return router;
}
