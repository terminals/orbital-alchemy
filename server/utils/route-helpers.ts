import path from 'path';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

/** Extract a human-readable message from an unknown error value. */
export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Validate that a relative path stays within bounds (no traversal). */
export function isValidRelativePath(p: string): boolean {
  const normalized = path.normalize(p);
  return !normalized.startsWith('..') && !path.isAbsolute(normalized) && !normalized.includes('\0');
}

/** Infer an HTTP status code from an error message. */
export function inferErrorStatus(msg: string): number {
  if (msg.includes('traversal')) return 403;
  if (msg.includes('ENOENT') || msg.includes('not found')) return 404;
  if (msg.includes('already exists')) return 409;
  if (msg.includes('directory')) return 400;
  return 500;
}

/**
 * Wrap an Express route handler to catch thrown errors and send a JSON error response.
 * Works with both sync and async handlers.
 *
 * @param fn — route handler that may throw
 * @param statusFn — optional function to infer status from error message (defaults to 500)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function catchRoute<Req extends Request = any, Res extends Response = any>(
  fn: (req: Req, res: Res, next: NextFunction) => void | Promise<void>,
  statusFn?: (msg: string) => number,
): RequestHandler {
  return ((req: Req, res: Res, next: NextFunction) => {
    try {
      const result = fn(req, res, next);
      if (result instanceof Promise) {
        result.catch((err: unknown) => {
          const msg = errMsg(err);
          res.status(statusFn ? statusFn(msg) : 500).json({ success: false, error: msg });
        });
      }
    } catch (err) {
      const msg = errMsg(err);
      res.status(statusFn ? statusFn(msg) : 500).json({ success: false, error: msg });
    }
  }) as unknown as RequestHandler;
}
