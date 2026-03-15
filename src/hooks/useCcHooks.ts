import { useState, useEffect } from 'react';
import type { CcHookParsed } from '../../shared/workflow-config';

export function useCcHooks() {
  const [ccHooks, setCcHooks] = useState<CcHookParsed[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/orbital/workflow/claude-hooks')
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const json = await res.json() as { data: CcHookParsed[] };
          setCcHooks(json.data);
        }
      })
      .catch(() => {/* swallow — CC hooks are optional */})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { ccHooks, loading };
}
