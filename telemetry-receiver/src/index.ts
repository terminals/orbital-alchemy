interface Env {
  BUCKET: R2Bucket;
  INGEST_KEY: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;

    if (path === '/health') {
      return json({ ok: true });
    }

    // PUT /ingest/:secret/upload/:project/:filename — secret path, write-only
    const uploadMatch = path.match(/^\/ingest\/([^/]+)\/upload\/([^/]+)\/([0-9a-f-]{36}\.jsonl)$/);
    if (request.method === 'PUT' && uploadMatch && uploadMatch[1] === env.INGEST_KEY) {
      // Reject files over 20MB
      const contentLength = parseInt(request.headers.get('Content-Length') ?? '0', 10);
      if (contentLength > 20 * 1024 * 1024) {
        return json({ error: 'File too large' }, 413);
      }

      const [, , project, filename] = uploadMatch;
      const key = `${decodeURIComponent(project)}/${filename}`;
      await env.BUCKET.put(key, request.body, {
        httpMetadata: { contentType: 'application/x-ndjson' },
      });
      return json({ ok: true, key });
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
