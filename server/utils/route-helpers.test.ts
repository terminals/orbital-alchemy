import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errMsg, isValidRelativePath, inferErrorStatus, catchRoute } from './route-helpers.js';

// ─── errMsg ─────────────────────────────────────────────────

describe('errMsg', () => {
  it('extracts message from Error instances', () => {
    expect(errMsg(new Error('something broke'))).toBe('something broke');
  });

  it('converts non-Error values to strings', () => {
    expect(errMsg('raw string')).toBe('raw string');
    expect(errMsg(42)).toBe('42');
    expect(errMsg(null)).toBe('null');
    expect(errMsg(undefined)).toBe('undefined');
  });
});

// ─── isValidRelativePath ────────────────────────────────────

describe('isValidRelativePath', () => {
  it('accepts normal relative paths', () => {
    expect(isValidRelativePath('hooks/init.sh')).toBe(true);
    expect(isValidRelativePath('agents/attacker/AGENT.md')).toBe(true);
    expect(isValidRelativePath('file.txt')).toBe(true);
  });

  it('rejects directory traversal', () => {
    expect(isValidRelativePath('../etc/passwd')).toBe(false);
    expect(isValidRelativePath('hooks/../../secret')).toBe(false);
  });

  it('rejects absolute paths', () => {
    expect(isValidRelativePath('/etc/passwd')).toBe(false);
  });

  it('rejects null bytes', () => {
    expect(isValidRelativePath('file\0.txt')).toBe(false);
  });
});

// ─── inferErrorStatus ───────────────────────────────────────

describe('inferErrorStatus', () => {
  it('returns 403 for traversal errors', () => {
    expect(inferErrorStatus('Path traversal detected')).toBe(403);
    expect(inferErrorStatus('directory traversal not allowed')).toBe(403);
  });

  it('returns 404 for not-found errors', () => {
    expect(inferErrorStatus('File not found')).toBe(404);
    expect(inferErrorStatus('ENOENT: no such file')).toBe(404);
  });

  it('returns 409 for already-exists errors', () => {
    expect(inferErrorStatus('File already exists at path')).toBe(409);
  });

  it('returns 400 for directory errors', () => {
    expect(inferErrorStatus('Cannot delete directory')).toBe(400);
  });

  it('returns 500 for unrecognized errors', () => {
    expect(inferErrorStatus('something unexpected')).toBe(500);
    expect(inferErrorStatus('')).toBe(500);
  });

  it('matches the first keyword when multiple are present', () => {
    // "traversal" comes first in the chain, should win
    expect(inferErrorStatus('traversal not found')).toBe(403);
  });
});

// ─── catchRoute ─────────────────────────────────────────────

describe('catchRoute', () => {
  function createApp(handler: express.RequestHandler) {
    const app = express();
    app.get('/test', handler);
    return app;
  }

  it('returns normal response when handler succeeds', async () => {
    const app = createApp(catchRoute((_req, res) => {
      res.json({ ok: true });
    }));

    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('catches sync throws and returns 500', async () => {
    const app = createApp(catchRoute(() => {
      throw new Error('sync failure');
    }));

    const res = await request(app).get('/test');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'sync failure' });
  });

  it('catches async throws and returns 500', async () => {
    const app = createApp(catchRoute(async () => {
      throw new Error('async failure');
    }));

    const res = await request(app).get('/test');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'async failure' });
  });

  it('uses custom statusFn for error status codes', async () => {
    const app = createApp(catchRoute(() => {
      throw new Error('File not found at path');
    }, inferErrorStatus));

    const res = await request(app).get('/test');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: 'File not found at path' });
  });

  it('uses custom statusFn for traversal errors', async () => {
    const app = createApp(catchRoute(() => {
      throw new Error('Path traversal detected');
    }, inferErrorStatus));

    const res = await request(app).get('/test');
    expect(res.status).toBe(403);
  });

  it('handles non-Error thrown values', async () => {
    const app = createApp(catchRoute(() => {
      // eslint-disable-next-line no-throw-literal
      throw 'raw string error';
    }));

    const res = await request(app).get('/test');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'raw string error' });
  });
});
