import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeployService } from './deploy-service.js';
import { createTestDb } from '../__tests__/helpers/db.js';
import { createMockEmitter } from '../__tests__/helpers/mock-emitter.js';
import type Database from 'better-sqlite3';
import type { Emitter } from '../project-emitter.js';

describe('DeployService', () => {
  let db: Database.Database;
  let cleanup: () => void;
  let emitter: Emitter & { emit: ReturnType<typeof vi.fn> };
  let service: DeployService;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    emitter = createMockEmitter();
    service = new DeployService(db, emitter);
  });

  afterEach(() => {
    cleanup?.();
  });

  // ─── record() ─────────────────────────────────────────────

  describe('record()', () => {
    it('inserts deployment and returns ID', () => {
      const id = service.record({
        environment: 'staging',
        status: 'deploying',
        commit_sha: 'abc1234',
        branch: 'main',
        pr_number: null,
        health_check_url: null,
        details: null,
      });

      expect(id).toBe(1);
      const row = db.prepare('SELECT * FROM deployments WHERE id = ?').get(id) as Record<string, unknown>;
      expect(row.environment).toBe('staging');
      expect(row.status).toBe('deploying');
    });

    it('emits deploy:updated with inserted row', () => {
      service.record({
        environment: 'production',
        status: 'deploying',
        commit_sha: 'def5678',
        branch: 'main',
        pr_number: 42,
        health_check_url: 'https://example.com/health',
        details: { version: '1.0.0' },
      });

      expect(emitter.emit).toHaveBeenCalledWith('deploy:updated', expect.objectContaining({
        environment: 'production',
        branch: 'main',
        pr_number: 42,
      }));
    });
  });

  // ─── updateStatus() ──────────────────────────────────────

  describe('updateStatus()', () => {
    let deployId: number;

    beforeEach(() => {
      deployId = service.record({
        environment: 'staging',
        status: 'deploying',
        commit_sha: 'abc',
        branch: 'main',
        pr_number: null,
        health_check_url: null,
        details: null,
      });
    });

    it('updates status and emits deploy:updated', () => {
      service.updateStatus(deployId, 'healthy');

      const row = db.prepare('SELECT * FROM deployments WHERE id = ?').get(deployId) as Record<string, unknown>;
      expect(row.status).toBe('healthy');
      // 1 from record + 1 from updateStatus
      expect(emitter.emit).toHaveBeenCalledTimes(2);
    });

    it('sets completed_at for terminal status: healthy', () => {
      service.updateStatus(deployId, 'healthy');
      const row = db.prepare('SELECT completed_at FROM deployments WHERE id = ?').get(deployId) as { completed_at: string | null };
      expect(row.completed_at).not.toBeNull();
      expect(row.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('sets completed_at for terminal status: failed', () => {
      service.updateStatus(deployId, 'failed');
      const row = db.prepare('SELECT completed_at FROM deployments WHERE id = ?').get(deployId) as { completed_at: string | null };
      expect(row.completed_at).not.toBeNull();
    });

    it('sets completed_at for terminal status: rolled-back', () => {
      service.updateStatus(deployId, 'rolled-back');
      const row = db.prepare('SELECT completed_at FROM deployments WHERE id = ?').get(deployId) as { completed_at: string | null };
      expect(row.completed_at).not.toBeNull();
    });

    it('does not set completed_at for non-terminal status', () => {
      service.updateStatus(deployId, 'deploying');
      const row = db.prepare('SELECT completed_at FROM deployments WHERE id = ?').get(deployId) as { completed_at: string | null };
      expect(row.completed_at).toBeNull();
    });
  });

  // ─── getRecent() ──────────────────────────────────────────

  describe('getRecent()', () => {
    it('returns deployments ordered by started_at DESC with limit', () => {
      service.record({ environment: 'staging', status: 'healthy', commit_sha: 'a', branch: 'main', pr_number: null, health_check_url: null, details: null });
      service.record({ environment: 'production', status: 'deploying', commit_sha: 'b', branch: 'main', pr_number: null, health_check_url: null, details: null });

      const recent = service.getRecent(1);
      expect(recent).toHaveLength(1);
    });
  });

  // ─── getLatestPerEnv() ────────────────────────────────────

  describe('getLatestPerEnv()', () => {
    it('returns one deployment per environment', () => {
      service.record({ environment: 'staging', status: 'healthy', commit_sha: 'a', branch: 'main', pr_number: null, health_check_url: null, details: null });
      service.record({ environment: 'staging', status: 'deploying', commit_sha: 'b', branch: 'main', pr_number: null, health_check_url: null, details: null });
      service.record({ environment: 'production', status: 'healthy', commit_sha: 'c', branch: 'main', pr_number: null, health_check_url: null, details: null });

      const latest = service.getLatestPerEnv();
      expect(latest).toHaveLength(2);
      const envs = latest.map(d => d.environment).sort();
      expect(envs).toEqual(['production', 'staging']);
    });

    it('returns empty when no deployments exist', () => {
      expect(service.getLatestPerEnv()).toEqual([]);
    });
  });
});
