import { useState, useCallback } from 'react';
import { ArrowLeft, Terminal, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { EnrichedSession } from '@/hooks/useScopeSessions';

const ACTION_LABELS: Record<string, string> = {
  createScope: 'Created',
  reviewScope: 'Reviewed',
  implementScope: 'Implemented',
  verifyScope: 'Verified',
  commit: 'Committed',
  pushToMain: 'Pushed to Main',
  pushToDev: 'Pushed to Dev',
  pushToStaging: 'PR to Staging',
  pushToProduction: 'PR to Production',
};

function actionLabel(action: string | null): string | null {
  if (!action) return null;
  return ACTION_LABELS[action] ?? action;
}

interface SessionPanelProps {
  sessions: EnrichedSession[];
  loading: boolean;
}

interface SessionMeta {
  slug: string;
  branch: string;
  fileSize: number;
  summary: string | null;
  startedAt: string;
  lastActiveAt: string;
}

interface SessionContent {
  id: string;
  content: string;
  claude_session_id: string | null;
  meta: SessionMeta | null;
}

export function SessionPanel({ sessions, loading }: SessionPanelProps) {
  const [selected, setSelected] = useState<EnrichedSession | null>(null);
  const [content, setContent] = useState<SessionContent | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [resuming, setResuming] = useState(false);

  const selectSession = useCallback(async (session: EnrichedSession) => {
    setSelected(session);
    setContentLoading(true);
    try {
      const res = await fetch(`/api/orbital/sessions/${session.id}/content`);
      if (res.ok) setContent(await res.json());
    } catch {
      // silent
    } finally {
      setContentLoading(false);
    }
  }, []);

  const handleResume = useCallback(async () => {
    const sessionId = selected?.claude_session_id;
    if (!sessionId) return;

    setResuming(true);
    try {
      await fetch(`/api/orbital/sessions/${selected.id}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claude_session_id: sessionId }),
      });
    } catch {
      // silent
    } finally {
      setTimeout(() => setResuming(false), 2000);
    }
  }, [selected]);

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // ─── Detail view ───────────────────────────────────────────
  if (selected) {
    const discoveries = Array.isArray(selected.discoveries) ? selected.discoveries : [];
    const nextSteps = Array.isArray(selected.next_steps) ? selected.next_steps : [];
    const canResume = !!selected.claude_session_id;
    const meta = content?.meta ?? null;
    // Prefer meta summary (from JSONL), then DB summary
    const rawDisplayName = meta?.summary ?? selected.summary ?? null;
    const displayName = rawDisplayName ? truncateText(rawDisplayName, 100) : null;

    return (
      <div className="flex h-full flex-col">
        {/* Back button + header */}
        <div className="flex items-center gap-2 pb-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => { setSelected(null); setContent(null); }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="text-xxs text-muted-foreground">
              {selected.started_at && format(new Date(selected.started_at), 'MMM d, yyyy')}
            </p>
            <p className="truncate text-sm font-light">
              {displayName || 'Untitled Session'}
            </p>
          </div>
        </div>

        <Separator className="mb-3" />

        {/* Content */}
        <ScrollArea className="flex-1 -mr-2 pr-2">
          {contentLoading ? (
            <div className="flex h-20 items-center justify-center">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <table className="w-full text-xs">
              <tbody className="[&_td]:border-b [&_td]:border-border/30 [&_td]:py-2 [&_td]:align-top [&_td:first-child]:pr-3 [&_td:first-child]:text-muted-foreground [&_td:first-child]:whitespace-nowrap">
                {/* DB fields */}
                <tr>
                  <td>Scope</td>
                  <td>{selected.scope_id}</td>
                </tr>
                {actionLabel(selected.action) && (
                  <tr>
                    <td>Action</td>
                    <td>{actionLabel(selected.action)}</td>
                  </tr>
                )}
                <tr>
                  <td>Summary</td>
                  <td>{selected.summary ? truncateText(selected.summary, 200) : '—'}</td>
                </tr>
                <tr>
                  <td>Started</td>
                  <td>{selected.started_at ? format(new Date(selected.started_at), 'MMM d, h:mm a') : '—'}</td>
                </tr>
                <tr>
                  <td>Ended</td>
                  <td>{selected.ended_at ? format(new Date(selected.ended_at), 'MMM d, h:mm a') : '—'}</td>
                </tr>

                {/* JSONL metadata (when available) */}
                {meta && (
                  <>
                    {meta.branch && meta.branch !== 'unknown' && (
                      <tr>
                        <td>Branch</td>
                        <td className="font-mono text-xxs">{meta.branch}</td>
                      </tr>
                    )}
                    {meta.fileSize > 0 && (
                      <tr>
                        <td>File size</td>
                        <td>{formatFileSize(meta.fileSize)}</td>
                      </tr>
                    )}
                    <tr>
                      <td>Plan</td>
                      <td className="text-muted-foreground">{meta.slug}</td>
                    </tr>
                  </>
                )}

                {/* Handoff file */}
                {selected.handoff_file && (
                  <tr>
                    <td>Handoff</td>
                    <td className="font-mono text-xxs">{selected.handoff_file}</td>
                  </tr>
                )}

                {/* Discoveries */}
                {discoveries.length > 0 && (
                  <tr>
                    <td>Completed</td>
                    <td>
                      <ul className="space-y-0.5">
                        {discoveries.map((item, idx) => (
                          <li key={idx} className="text-muted-foreground">
                            <span className="text-bid-green mr-1">{'•'}</span>{item}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}

                {/* Next steps */}
                {nextSteps.length > 0 && (
                  <tr>
                    <td>Next steps</td>
                    <td>
                      <ul className="space-y-0.5">
                        {nextSteps.map((item, idx) => (
                          <li key={idx} className="text-muted-foreground">
                            <span className="text-accent-blue mr-1">{'•'}</span>{item}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}

                {/* Session ID */}
                {selected.claude_session_id && (
                  <tr>
                    <td>Session ID</td>
                    <td className="font-mono text-xxs text-muted-foreground">{selected.claude_session_id}</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </ScrollArea>

        {/* Resume button */}
        <div className="pt-3">
          <Button
            className="w-full"
            disabled={!canResume || resuming}
            onClick={handleResume}
            title={canResume ? 'Open in iTerm' : 'No Claude Code session found'}
          >
            <Terminal className="mr-2 h-4 w-4" />
            {resuming ? 'Opening iTerm...' : 'Resume Session'}
          </Button>
          {!canResume && (
            <p className="mt-1.5 text-center text-xs text-muted-foreground">
              No matching Claude Code session found
            </p>
          )}
        </div>
      </div>
    );
  }

  // ─── List view ─────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 pb-3">
        <h3 className="text-xs font-normal">Sessions</h3>
        <Badge variant="secondary" className="text-xxs">
          {sessions.length}
        </Badge>
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs text-muted-foreground">No sessions recorded yet</p>
        </div>
      ) : (
        <ScrollArea className="flex-1 -mr-2 pr-2">
          <div className="space-y-2">
            {sessions.map((session) => {
              const discoveries = Array.isArray(session.discoveries) ? session.discoveries : [];
              const nextSteps = Array.isArray(session.next_steps) ? session.next_steps : [];

              return (
                <Card
                  key={session.id}
                  className={cn(
                    'cursor-pointer transition-colors hover:border-primary/30',
                    session.claude_session_id && 'border-l-2 border-l-primary/50',
                    'glow-blue-sm',
                  )}
                  onClick={() => selectSession(session)}
                >
                  <CardContent className="p-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xxs text-muted-foreground">
                          {session.started_at && format(new Date(session.started_at), 'MMM d')}
                        </span>
                        {actionLabel(session.action) && (
                          <Badge variant="outline" className="text-xxs px-1 py-0 font-light">
                            {actionLabel(session.action)}
                          </Badge>
                        )}
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                    </div>
                    <p className="mt-1 truncate text-xs font-normal">
                      {session.summary || 'Untitled Session'}
                    </p>
                    <div className="mt-1.5 flex items-center gap-3 text-xxs text-muted-foreground">
                      {discoveries.length > 0 && (
                        <span className="text-bid-green">{discoveries.length} completed</span>
                      )}
                      {nextSteps.length > 0 && (
                        <span className="text-accent-blue">{nextSteps.length} next</span>
                      )}
                      {session.claude_session_id && (
                        <span className="text-primary/70">resumable</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function truncateText(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '...' : text;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
