import { useState, useMemo } from 'react';
import { GitCommit } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CommitRow } from './CommitRow';
import type { CommitEntry, BranchInfoData } from '@/types';

interface Props {
  commits: CommitEntry[];
  branches: BranchInfoData[];
  hasMore: boolean;
  onLoadMore: () => void;
}

type FilterTab = 'all' | 'main' | 'feature';

export function CommitLog({ commits, branches, hasMore, onLoadMore }: Props) {
  const [filter, setFilter] = useState<FilterTab>('all');

  const mainBranches = useMemo(() => {
    const names = new Set(['main', 'master', 'dev', 'develop', 'staging', 'production']);
    for (const b of branches) {
      if (!b.isRemote && !b.name.startsWith('feat/') && !b.name.startsWith('fix/')) {
        names.add(b.name);
      }
    }
    return names;
  }, [branches]);

  const filtered = useMemo(() => {
    if (filter === 'all') return commits;
    if (filter === 'main') {
      return commits.filter(c => !c.branch || mainBranches.has(c.branch));
    }
    // feature
    return commits.filter(c => c.branch && !mainBranches.has(c.branch));
  }, [commits, filter, mainBranches]);

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'main', label: 'Main' },
    { key: 'feature', label: 'Feature' },
  ];

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <GitCommit className="h-4 w-4 text-primary" />
            Commits
            <Badge variant="secondary">{filtered.length}</Badge>
          </CardTitle>
          <div className="flex gap-1">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                  filter === tab.key
                    ? 'bg-surface-light text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <div className="py-8 text-center">
            <GitCommit className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No commits found.</p>
          </div>
        ) : (
          <>
            <ScrollArea className="max-h-[600px]">
              <div className="space-y-0.5">
                {filtered.map(commit => (
                  <CommitRow key={commit.sha} commit={commit} />
                ))}
              </div>
            </ScrollArea>
            {hasMore && (
              <button
                onClick={onLoadMore}
                className="mt-3 w-full rounded border border-border py-2 text-xs text-muted-foreground transition-colors hover:bg-surface-light hover:text-foreground"
              >
                Load more commits
              </button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
