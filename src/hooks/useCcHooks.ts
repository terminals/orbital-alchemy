import { useState, useEffect } from 'react';
import { useProjectUrl } from './useProjectUrl';
import type { CcHookParsed } from '../../shared/workflow-config';

export function useCcHooks() {
  const [ccHooks, setCcHooks] = useState<CcHookParsed[]>([]);
  const [loading, setLoading] = useState(true);
  const buildUrl = useProjectUrl();

  useEffect(() => {
    let cancelled = false;
    fetch(buildUrl('/workflow/claude-hooks'))
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
  }, [buildUrl]);

  return { ccHooks, loading };
}
