import { CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DriftCommit } from '@/types';

interface Props {
  devToStaging: { count: number; commits: DriftCommit[] };
  stagingToMain: { count: number; commits: DriftCommit[] };
}

function CommitRow({ commit }: { commit: DriftCommit }) {
  return (
    <div className="flex items-center gap-4 rounded px-2.5 py-1.5 transition-colors hover:bg-surface-light">
      <code className="font-mono text-xs text-accent-blue shrink-0">
        {commit.sha.slice(0, 7)}
      </code>
      <span className="flex-1 truncate text-xs font-normal text-foreground">
        {commit.message}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {commit.author}
      </span>
      <span className="shrink-0 text-[10px] text-muted-foreground/60">
        {formatDistanceToNow(new Date(commit.date), { addSuffix: true })}
      </span>
    </div>
  );
}

function EmptySync() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <CheckCircle2 className="mb-2 h-8 w-8 text-bid-green" />
      <span className="text-sm text-bid-green">In sync</span>
    </div>
  );
}

export function PromotionQueue({ devToStaging, stagingToMain }: Props) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Promotion Queue</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="dev-staging">
          <TabsList>
            <TabsTrigger value="dev-staging">
              dev &rarr; staging ({devToStaging.count})
            </TabsTrigger>
            <TabsTrigger value="staging-main">
              staging &rarr; main ({stagingToMain.count})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dev-staging">
            {devToStaging.commits.length === 0 ? (
              <EmptySync />
            ) : (
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-0.5">
                  {devToStaging.commits.map((c) => (
                    <CommitRow key={c.sha} commit={c} />
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="staging-main">
            {stagingToMain.commits.length === 0 ? (
              <EmptySync />
            ) : (
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-0.5">
                  {stagingToMain.commits.map((c) => (
                    <CommitRow key={c.sha} commit={c} />
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
