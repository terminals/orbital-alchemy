import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDataRoutes } from '../routes/data-routes.js';
import { EventService } from '../services/event-service.js';
import { GateService } from '../services/gate-service.js';
import { DeployService } from '../services/deploy-service.js';
import { WorkflowEngine } from '../../shared/workflow-engine.js';
import { createTestDb } from './helpers/db.js';
import { createMockEmitter } from './helpers/mock-emitter.js';
import { DEFAULT_CONFIG } from '../../shared/__fixtures__/workflow-configs.js';
import { loadConfig } from '../config.js';
import type Database from 'better-sqlite3';

describe('data-routes', () => {
  let app: express.Express;
  let db: Database.Database;
  let cleanup: () => void;

  beforeAll(() => {
    ({ db, cleanup } = createTestDb());
    const emitter = createMockEmitter();
    const engine = new WorkflowEngine(DEFAULT_CONFIG);
    const eventService = new EventService(db, emitter);
    const gateService = new GateService(db, emitter);
    const deployService = new DeployService(db, emitter);

    const mockGitService = {
      getPipelineDrift: vi.fn().mockReturnValue({ ahead: 0, behind: 0, files: [] }),
      getStatusHash: vi.fn().mockReturnValue('abc123'),
      getWorktrees: vi.fn().mockReturnValue([]),
      getCurrentBranch: vi.fn().mockReturnValue('main'),
      isDirty: vi.fn().mockReturnValue(false),
    } as unknown;

    const router = createDataRoutes({
      db,
      io: emitter,
      eventService,
      gateService,
      deployService,
      gitService: mockGitService as Parameters<typeof createDataRoutes>[0]['gitService'],
      engine,
      projectRoot: '/tmp/test-project',
      inferScopeStatus: vi.fn(),
      config: loadConfig('/tmp/test-project'),
    });

    app = express();
    app.use(express.json());
    app.use('/api/orbital', router);
  });

  afterAll(() => {
    cleanup?.();
  });

  // ─── Event Endpoints ──────────────────────────────────────

  describe('POST /api/orbital/events', () => {
    it('creates event with valid body (201)', async () => {
      const res = await request(app)
        .post('/api/orbital/events')
        .send({ type: 'TEST_EVENT', scope_id: 1, data: { foo: 'bar' } });

      expect(res.status).toBe(201);
      expect(res.body.type).toBe('TEST_EVENT');
      expect(res.body.id).toBeDefined();
    });

    it('rejects missing type (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/events')
        .send({ scope_id: 1 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('type');
    });

    it('rejects invalid scope_id (400)', async () => {
      const res = await request(app)
        .post('/api/orbital/events')
        .send({ type: 'TEST', scope_id: -1 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('scope_id');
    });
  });

  describe('GET /api/orbital/events', () => {
    it('returns events', async () => {
      const res = await request(app).get('/api/orbital/events');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ─── Gate Endpoints ───────────────────────────────────────

  describe('POST /api/orbital/gates', () => {
    it('records gate result (201)', async () => {
      const res = await request(app)
        .post('/api/orbital/gates')
        .send({ gate_name: 'type-check', status: 'pass', duration_ms: 1200 });

      expect(res.status).toBe(201);
    });
  });

  describe('GET /api/orbital/gates/stats', () => {
    it('returns stats array', async () => {
      const res = await request(app).get('/api/orbital/gates/stats');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ─── Deployment Endpoints ─────────────────────────────────

  describe('POST /api/orbital/deployments', () => {
    it('records deployment (201)', async () => {
      const res = await request(app)
        .post('/api/orbital/deployments')
        .send({ environment: 'staging', status: 'deploying', commit_sha: 'abc' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });
  });

  describe('GET /api/orbital/deployments', () => {
    it('returns recent deployments', async () => {
      const res = await request(app).get('/api/orbital/deployments');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ─── Violations Summary ───────────────────────────────────

  describe('GET /api/orbital/events/violations/summary', () => {
    it('returns summary structure', async () => {
      const res = await request(app).get('/api/orbital/events/violations/summary');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalViolations');
      expect(res.body).toHaveProperty('totalOverrides');
      expect(res.body).toHaveProperty('byRule');
      expect(res.body).toHaveProperty('byFile');
    });
  });
});
