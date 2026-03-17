import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import type { CommitEntry } from '@/types';

interface Props {
  commit: CommitEntry;
}

export function CommitRow({ commit }: Props) {
  return (
    <div className="flex items-center gap-3 rounded px-2.5 py-1.5 transition-colors hover:bg-surface-light">
      {/* SHA */}
      <code className="shrink-0 font-mono text-xs text-primary">
        {commit.shortSha}
      </code>

      {/* Message */}
      <span className="min-w-0 flex-1 truncate text-sm">
        {commit.message}
      </span>

      {/* Branch ref badge */}
      {commit.branch && (
        <Badge variant="outline" className="shrink-0 text-xs font-normal">
          {commit.branch}
        </Badge>
      )}

      {/* Scope link */}
      {commit.scopeId && (
        <Badge variant="secondary" className="shrink-0 text-xs">
          #{commit.scopeId}
        </Badge>
      )}

      {/* Author */}
      <span className="shrink-0 text-xs text-muted-foreground">
        {commit.author}
      </span>

      {/* Time */}
      <span className="shrink-0 text-xs text-muted-foreground/60">
        {formatDistanceToNow(new Date(commit.date), { addSuffix: true })}
      </span>
    </div>
  );
}
