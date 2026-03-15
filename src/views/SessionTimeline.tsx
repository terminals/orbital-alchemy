import { useEffect, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Clock, FileText, Terminal } from 'lucide-react';
import { format } from 'date-fns';
import { socket } from '@/socket';
import { useTheme } from '@/hooks/useTheme';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn, formatScopeId } from '@/lib/utils';
import type { Session } from '@/types';

const sessionStagger = { show: { transition: { staggerChildren: 0.04 } } };
const sessionItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 25 } },
};

interface SessionMeta {
  slug: string;
  branch: string;
  fileSize: number;
  summary: string | null;
  startedAt: string;
  lastActiveAt: string;
}

interface SessionDetail {
  id: string;
  content: string;
  claude_session_id: string | null;
  meta: SessionMeta | null;
}

/** Session with aggregated scope_ids and actions from deduplicated backend response */
interface TimelineSession extends Session {
  scope_ids: number[];
  actions: string[];
}

const ACTION_LABELS: Record<string, string> = {
  createScope: 'Created',
  implementScope: 'Implemented',
  pushToDev: 'Pushed to Dev',
  prStaging: 'PR to Staging',
  prProduction: 'PR to Production',
  codeReview: 'Reviewed',
  saveWork: 'Saved',
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

// ─── Main Component ────────────────────────────────────────

export function SessionTimeline() {
  const [sessions, setSessions] = useState<TimelineSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TimelineSession | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resuming, setResuming] = useState(false);
  const { neonGlass } = useTheme();
  const autoSelected = useRef(false);

  const selectSession = useCallback(async (session: TimelineSession) => {
    setSelected(session);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/orbital/sessions/${session.id}/content`);
      if (res.ok) setDetail(await res.json());
    } catch { /* silent */ }
    finally { setDetailLoading(false); }
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/orbital/sessions');
      if (res.ok) setSessions(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // Auto-select first session on initial load
  useEffect(() => {
    if (!autoSelected.current && sessions.length > 0) {
      autoSelected.current = true;
      selectSession(sessions[0]);
    }
  }, [sessions, selectSession]);

  useEffect(() => {
    const onUpdate = () => fetchSessions();
    socket.on('session:updated', onUpdate);
    return () => { socket.off('session:updated', onUpdate); };
  }, [fetchSessions]);

  const handleResume = useCallback(async () => {
    const sessionId = detail?.claude_session_id;
    if (!selected || !sessionId) return;
    setResuming(true);
    try {
      await fetch(`/api/orbital/sessions/${selected.id}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claude_session_id: sessionId }),
      });
    } catch { /* silent */ }
    finally { setTimeout(() => setResuming(false), 2000); }
  }, [selected, detail]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="mb-4 flex items-center gap-3">
        <Clock className="h-4 w-4 text-primary" />
        <h1 className="text-xl font-light">Session Timeline</h1>
        <Badge variant="secondary">{sessions.length} sessions</Badge>
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <Clock className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              No session history yet. Sessions are recorded from handoff files.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 gap-0 overflow-hidden rounded-lg border border-border/50">
          {/* Left: session list */}
          <div className="w-[40%] border-r border-border/50 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="relative p-3">
                <div className="absolute left-6 top-3 bottom-3 w-px bg-border" />
                {neonGlass ? (
                  <motion.div className="space-y-1" variants={sessionStagger} initial="hidden" animate="show">
                    {sessions.map((s) => (
                      <motion.div key={s.id} variants={sessionItem}>
                        <SessionListItem session={s} isSelected={selected?.id === s.id} neonGlass onClick={() => selectSession(s)} />
                      </motion.div>
                    ))}
                  </motion.div>
                ) : (
                  <div className="space-y-1">
                    {sessions.map((s) => (
                      <SessionListItem key={s.id} session={s} isSelected={selected?.id === s.id} neonGlass={false} onClick={() => selectSession(s)} />
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right: detail pane */}
          <div className="w-[60%] overflow-hidden">
            {selected ? (
              <DetailPane session={selected} detail={detail} loading={detailLoading} resuming={resuming} onResume={handleResume} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <Clock className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Select a session to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Session List Item ─────────────────────────────────────

function SessionListItem({ session, isSelected, neonGlass, onClick }: {
  session: TimelineSession; isSelected: boolean; neonGlass: boolean; onClick: () => void;
}) {
  const scopeIds = session.scope_ids;
  const discoveries = Array.isArray(session.discoveries) ? session.discoveries : [];
  const nextSteps = Array.isArray(session.next_steps) ? session.next_steps : [];

  return (
    <div className="relative pl-8 cursor-pointer" onClick={onClick}>
      <div className={cn(
        'absolute left-1.5 top-3 h-2.5 w-2.5 rounded-full border-2',
        isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/40 bg-background',
        neonGlass && 'timeline-dot-glow glow-blue',
      )} />
      <div className={cn(
        'rounded-md px-3 py-2 transition-colors',
        isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50',
      )}>
        <div className="flex items-center gap-1.5 flex-wrap">
          {session.started_at && (
            <span className="text-xxs text-muted-foreground">{format(new Date(session.started_at), 'MMM d')}</span>
          )}
          {scopeIds.slice(0, 3).map((id) => (
            <Badge key={id} variant="outline" className="font-mono text-xxs px-1 py-0">{formatScopeId(id)}</Badge>
          ))}
          {scopeIds.length > 3 && (
            <span className="text-xxs text-muted-foreground">+{scopeIds.length - 3}</span>
          )}
          {session.actions?.slice(0, 2).map((a) => (
            <Badge key={a} variant="secondary" className="text-xxs px-1 py-0 font-light">{actionLabel(a)}</Badge>
          ))}
        </div>
        <p className={cn('mt-0.5 text-xs font-normal truncate', isSelected ? 'text-foreground' : 'text-foreground/80')}>
          {session.summary ? truncate(session.summary, 80) : 'Untitled Session'}
        </p>
        <div className="mt-1 flex items-center gap-3 text-xxs text-muted-foreground">
          {discoveries.length > 0 && <span className="text-bid-green">{discoveries.length} completed</span>}
          {nextSteps.length > 0 && <span className="text-accent-blue">{nextSteps.length} next</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Detail Pane ───────────────────────────────────────────

function DetailPane({ session, detail, loading, resuming, onResume }: {
  session: TimelineSession; detail: SessionDetail | null; loading: boolean; resuming: boolean; onResume: () => void;
}) {
  const scopeIds = session.scope_ids;
  const discoveries = Array.isArray(session.discoveries) ? session.discoveries : [];
  const nextSteps = Array.isArray(session.next_steps) ? session.next_steps : [];
  const meta = detail?.meta ?? null;
  const canResume = !!detail?.claude_session_id;
  const displayName = meta?.summary ?? session.summary ?? null;

  // Build metadata rows as [label, value, className?] tuples
  const rows: [string, string, string?][] = [];
  if (scopeIds.length > 0) rows.push(['Scopes', scopeIds.map((id) => formatScopeId(id)).join(', ')]);
  if (session.actions?.length > 0) rows.push(['Actions', session.actions.map(actionLabel).join(', ')]);
  if (session.summary) rows.push(['Summary', truncate(session.summary, 200)]);
  rows.push(['Started', session.started_at ? format(new Date(session.started_at), 'MMM d, h:mm a') : '—']);
  rows.push(['Ended', session.ended_at ? format(new Date(session.ended_at), 'MMM d, h:mm a') : '—']);
  if (meta?.branch && meta.branch !== 'unknown') rows.push(['Branch', meta.branch, 'font-mono text-xxs']);
  if (meta && meta.fileSize > 0) rows.push(['File size', formatFileSize(meta.fileSize)]);
  if (meta) rows.push(['Plan', meta.slug, 'text-muted-foreground']);
  if (session.handoff_file) rows.push(['Handoff', session.handoff_file, 'font-mono text-xxs']);
  if (detail?.claude_session_id) rows.push(['Session ID', detail.claude_session_id, 'font-mono text-xxs text-muted-foreground']);

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-4 pb-3">
        <p className="text-xxs text-muted-foreground">
          {session.started_at && format(new Date(session.started_at), 'MMM d, yyyy — h:mm a')}
          {scopeIds.length > 0 && scopeIds.slice(0, 4).map((id) => (
            <span key={id} className="ml-1.5">
              <Badge variant="outline" className="font-mono text-xxs">{formatScopeId(id)}</Badge>
            </span>
          ))}
          {scopeIds.length > 4 && <span className="ml-1 text-xxs">+{scopeIds.length - 4}</span>}
        </p>
        <h2 className="mt-1 text-sm font-light">{displayName ? truncate(displayName, 120) : 'Untitled Session'}</h2>
      </div>

      <Separator />

      <ScrollArea className="flex-1">
        <div className="px-5 py-4">
          {loading ? (
            <div className="flex h-20 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <>
              <table className="w-full table-fixed text-xs">
                <colgroup><col className="w-24" /><col /></colgroup>
                <tbody className="[&_td]:border-b [&_td]:border-border/30 [&_td]:py-2 [&_td]:align-top [&_td:first-child]:pr-3 [&_td:first-child]:text-muted-foreground [&_td:first-child]:whitespace-nowrap [&_td:last-child]:break-all">
                  {rows.map(([label, value, cls]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td className={cls}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <BulletSection title="Completed" items={discoveries} color="text-bid-green" />
              <BulletSection title="Next Steps" items={nextSteps} color="text-accent-blue" />

              {session.handoff_file && (
                <div className="mt-4 flex items-center gap-1.5 text-xxs text-muted-foreground/60">
                  <FileText className="h-3 w-3" />
                  <span className="truncate">{session.handoff_file}</span>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {!loading && (
        <div className="border-t border-border/50 px-5 py-3">
          <Button className="w-full" disabled={!canResume || resuming} onClick={onResume}
            title={canResume ? 'Open in iTerm' : 'No Claude Code session found'}>
            <Terminal className="mr-2 h-4 w-4" />
            {resuming ? 'Opening iTerm...' : 'Resume Session'}
          </Button>
          {!canResume && <p className="mt-1.5 text-center text-xxs text-muted-foreground">No matching Claude Code session found</p>}
        </div>
      )}
    </div>
  );
}

// ─── Shared Helpers ────────────────────────────────────────

function BulletSection({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-5">
      <h4 className="mb-2 text-xxs font-medium uppercase tracking-wider text-muted-foreground">{title}</h4>
      <ul className="space-y-1.5">
        {items.map((item, idx) => (
          <li key={idx} className="flex items-start gap-2 text-xs">
            <span className={cn('mt-0.5', color)}>{'•'}</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '...' : text;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
