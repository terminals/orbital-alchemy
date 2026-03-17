import { useState, useEffect, useCallback, useRef } from 'react';
import type { ConfigPrimitiveType } from '@/types';

interface UseFileEditorResult {
  content: string;
  setContent: (value: string) => void;
  frontmatter: Record<string, string>;
  setFrontmatterField: (key: string, value: string) => void;
  body: string;
  setBody: (value: string) => void;
  dirty: boolean;
  saving: boolean;
  loading: boolean;
  save: () => Promise<void>;
  error: string | null;
}

/** Split raw content into frontmatter fields and body */
function parseFrontmatter(raw: string): { fields: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { fields: {}, body: raw };

  const fields: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      fields[key] = val;
    }
  }
  return { fields, body: match[2] };
}

/** Serialize frontmatter fields + body back into raw content */
function serializeFrontmatter(fields: Record<string, string>, body: string): string {
  const entries = Object.entries(fields).filter(([, v]) => v !== '');
  if (entries.length === 0) return body;
  const yaml = entries.map(([k, v]) => `${k}: ${v}`).join('\n');
  return `---\n${yaml}\n---\n${body}`;
}

export function useFileEditor(
  type: ConfigPrimitiveType | null,
  filePath: string | null,
): UseFileEditorResult {
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [frontmatter, setFrontmatter] = useState<Record<string, string>>({});
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the current fetch to avoid race conditions
  const fetchIdRef = useRef(0);

  // Fetch file content
  useEffect(() => {
    if (!type || !filePath) {
      setContent('');
      setSavedContent('');
      setFrontmatter({});
      setBody('');
      setError(null);
      return;
    }

    const id = ++fetchIdRef.current;
    setLoading(true);
    setError(null);

    fetch(`/api/orbital/config/${type}/file?path=${encodeURIComponent(filePath)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (id !== fetchIdRef.current) return; // stale
        const raw = json.data?.content ?? '';
        setContent(raw);
        setSavedContent(raw);
        const parsed = parseFrontmatter(raw);
        setFrontmatter(parsed.fields);
        setBody(parsed.body);
      })
      .catch((err) => {
        if (id !== fetchIdRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load file');
      })
      .finally(() => {
        if (id === fetchIdRef.current) setLoading(false);
      });
  }, [type, filePath]);

  // Update raw content when frontmatter or body changes (keep in sync)
  const updateContent = useCallback((newFields: Record<string, string>, newBody: string) => {
    const raw = serializeFrontmatter(newFields, newBody);
    setContent(raw);
  }, []);

  const setFrontmatterField = useCallback((key: string, value: string) => {
    setFrontmatter((prev) => {
      const next = { ...prev, [key]: value };
      setBody((b) => {
        updateContent(next, b);
        return b;
      });
      return next;
    });
  }, [updateContent]);

  const handleSetBody = useCallback((value: string) => {
    setBody(value);
    setFrontmatter((f) => {
      updateContent(f, value);
      return f;
    });
  }, [updateContent]);

  const handleSetContent = useCallback((value: string) => {
    setContent(value);
    const parsed = parseFrontmatter(value);
    setFrontmatter(parsed.fields);
    setBody(parsed.body);
  }, []);

  // Save
  const save = useCallback(async () => {
    if (!type || !filePath) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/orbital/config/${type}/file`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: 'Save failed' }));
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setSavedContent(content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [type, filePath, content]);

  const dirty = content !== savedContent;

  return {
    content,
    setContent: handleSetContent,
    frontmatter,
    setFrontmatterField,
    body,
    setBody: handleSetBody,
    dirty,
    saving,
    loading,
    save,
    error,
  };
}
