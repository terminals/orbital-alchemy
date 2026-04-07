import { useState, useRef } from 'react';
import { Circle, Loader2 } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useProjectUrl } from '@/hooks/useProjectUrl';
import type { PullRequestInfo, CheckRun } from '@/types';

// Client-side cache for CI checks (survives re-renders, cleared on page reload)
const checksCache = new Map<string, { data: CheckRun[]; ts: number }>();
const CACHE_TTL = 60_000;

interface Props {
  commitSha?: string;
  pr?: PullRequestInfo;
}

export function CIStatusBadge({ commitSha, pr }: Props) {
  const buildUrl = useProjectUrl();
  const [checks, setChecks] = useState<CheckRun[] | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  // Use the PR's branch head or the commit SHA
  const ref = commitSha ?? pr?.branch;
  if (!ref) return null;

  const fetchChecks = async () => {
    if (fetchedRef.current || loading) return;

    // Check cache first
    const cached = checksCache.get(ref);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setChecks(cached.data);
      fetchedRef.current = true;
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(buildUrl(`/github/checks/${ref}`));
      if (res.ok) {
        const data: CheckRun[] = await res.json();
        checksCache.set(ref, { data, ts: Date.now() });
        setChecks(data);
      }
    } catch { /* ok */ }
    setLoading(false);
    fetchedRef.current = true;
  };

  // Determine overall status from cached checks
  let statusColor = 'text-muted-foreground/30';
  let statusLabel = 'CI';
  if (checks && checks.length > 0) {
    const hasFailure = checks.some(c => c.conclusion === 'failure');
    const hasRunning = checks.some(c => c.status === 'in_progress' || c.status === 'queued');
    const allPassed = checks.every(c => c.conclusion === 'success' || c.conclusion === 'neutral');

    if (hasFailure) {
      statusColor = 'text-ask-red';
      statusLabel = `${checks.filter(c => c.conclusion === 'failure').length} failing`;
    } else if (hasRunning) {
      statusColor = 'text-warning-amber';
      statusLabel = 'Running';
    } else if (allPassed) {
      statusColor = 'text-bid-green';
      statusLabel = 'Passed';
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger
        className="shrink-0"
        onMouseEnter={fetchChecks}
      >
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/50" />
        ) : (
          <Circle className={`h-2.5 w-2.5 fill-current ${statusColor}`} />
        )}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {checks === null ? (
          <span className="text-xs">Hover to load CI status</span>
        ) : checks.length === 0 ? (
          <span className="text-xs">No CI checks</span>
        ) : (
          <div className="space-y-1">
            <p className="text-xs font-medium">{statusLabel}</p>
            {checks.slice(0, 5).map((c, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs">
                <Circle className={`h-1.5 w-1.5 fill-current ${
                  c.conclusion === 'success' ? 'text-bid-green'
                    : c.conclusion === 'failure' ? 'text-ask-red'
                    : 'text-warning-amber'
                }`} />
                <span className="truncate">{c.name}</span>
              </div>
            ))}
            {checks.length > 5 && (
              <p className="text-xs text-muted-foreground">+{checks.length - 5} more</p>
            )}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
