import { useEffect, useState, useCallback, useMemo } from 'react';
import { Clock, ExternalLink, FileText, Terminal } from 'lucide-react';
import { useProjects } from '@/hooks/useProjectContext';
import { format } from 'date-fns';
import { socket } from '@/socket';
import { useTheme } from '@/hooks/useTheme';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn, formatScopeId } from '@/lib/utils';
import { ProjectTabBar } from '@/components/ProjectTabBar';
import type { Session } from '@/types';

interface SessionMeta {
  slug: string;
  branch: string;
  fileSize: number;
  summary: string | null;
  startedAt: string;
  lastActiveAt: string;
}

interface SessionStatsUser {
  totalMessages: number;
  metaMessages: number;
  toolResults: number;
  commands: string[];
  permissionModes: string[];
  cwd: string | null;
  version: string | null;
}

interface SessionStatsAssistant {
  totalMessages: number;
  models: string[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  toolsUsed: Record<string, number>;
}

interface SessionStatsSystem {
  totalMessages: number;
  subtypes: string[];
  stopReasons: string[];
  totalDurationMs: number;
  hookCount: number;
  hookErrors: number;
}

interface SessionStats {
  typeCounts: Record<string, number>;
  user: SessionStatsUser;
  assistant: SessionStatsAssistant;
  system: SessionStatsSystem;
  progress: { totalLines: number };
  timing: { firstTimestamp: string | null; lastTimestamp: string | null; durationMs: number };
}

interface SessionDetail {
  id: string;
  content: string;
  claude_session_id: string | null;
  meta: SessionMeta | null;
  stats: SessionStats | null;
}

/** Session with aggregated scope_ids and actions from deduplicated backend response */
interface TimelineSession extends Session {
  scope_ids: number[];
  actions: string[];
}

const ACTION_LABELS: Record<string, string> = {
  createScope: 'Created',
  reviewScope: 'Reviewed',
  implementScope: 'Implemented',
  verifyScope: 'Verified',
  reviewGate: 'Review Gate',
  fixReview: 'Fix Review',
  commit: 'Committed',
  pushToMain: 'Pushed to Main',
  pushToDev: 'Pushed to Dev',
  pushToStaging: 'PR to Staging',
  pushToProduction: 'PR to Production',
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

// ─── Main Component ────────────────────────────────────────

export function SessionTimeline() {
  const { activeProjectId, isMultiProject, getApiBase } = useProjects();
  const [allSessions, setAllSessions] = useState<TimelineSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TimelineSession | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resuming, setResuming] = useState(false);
  const { neonGlass } = useTheme();

  // Always fetch ALL sessions once — client-side filtering handles project tabs
  const fetchAllSessions = useCallback(async () => {
    try {
      const url = isMultiProject
        ? '/api/orbital/aggregate/sessions'
        : '/api/orbital/sessions';
      const res = await fetch(url);
      if (res.ok) setAllSessions(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [isMultiProject]);

  useEffect(() => { fetchAllSessions(); }, [fetchAllSessions]);

  useEffect(() => {
    const onUpdate = () => fetchAllSessions();
    socket.on('session:updated', onUpdate);
    return () => { socket.off('session:updated', onUpdate); };
  }, [fetchAllSessions]);

  // Client-side filter — instant, no network, no loading state
  const sessions = useMemo(() => {
    if (!activeProjectId) return allSessions;
    return allSessions.filter(s => s.project_id === activeProjectId);
  }, [allSessions, activeProjectId]);

  // Clear selection when it no longer exists in filtered list
  useEffect(() => {
    if (selected && !sessions.some(s => s.id === selected.id)) {
      setSelected(null);
      setDetail(null);
    }
  }, [sessions, selected]);

  // Auto-select first session when list changes and nothing is selected
  useEffect(() => {
    if (!selected && sessions.length > 0) {
      selectSession(sessions[0]);
    }
  }, [sessions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Detail fetch uses the session's own project context for correct routing
  const selectSession = useCallback(async (session: TimelineSession) => {
    setSelected(session);
    setDetail(null);
    setDetailLoading(true);
    try {
      const base = session.project_id
        ? getApiBase(session.project_id)
        : '/api/orbital';
      const res = await fetch(`${base}/sessions/${session.id}/content`);
      if (res.ok) setDetail(await res.json());
    } catch { /* silent */ }
    finally { setDetailLoading(false); }
  }, [getApiBase]);

  const handleResume = useCallback(async () => {
    const sessionId = detail?.claude_session_id;
    if (!selected || !sessionId) return;
    setResuming(true);
    try {
      const base = selected.project_id
        ? getApiBase(selected.project_id)
        : '/api/orbital';
      await fetch(`${base}/sessions/${selected.id}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claude_session_id: sessionId }),
      });
    } catch { /* silent */ }
    finally { setTimeout(() => setResuming(false), 2000); }
  }, [selected, detail, getApiBase]);

  const showList = !loading && sessions.length > 0;

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <ProjectTabBar />

      <div className="mb-4 flex items-center gap-3">
        <Clock className="h-4 w-4 text-primary" />
        <h1 className="text-xl font-light">Sessions</h1>
        {!loading && <Badge variant="secondary">{sessions.length} sessions</Badge>}
      </div>

      {/* Container structure always stays mounted — only inner content swaps */}
      <div className="flex flex-1 gap-0 overflow-hidden rounded-lg border border-border/50">
        {/* Left pane */}
        <div className="w-[40%] border-r border-border/50 overflow-hidden">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : !showList ? (
            <div className="flex h-full items-center justify-center p-4">
              <div className="text-center">
                <Clock className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">No session history yet.</p>
              </div>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="relative p-3">
                <div className="absolute left-6 top-3 bottom-3 w-px bg-border" />
                <div className="space-y-1">
                  {sessions.map((s) => (
                    <SessionListItem key={s.id} session={s} isSelected={selected?.id === s.id} neonGlass={neonGlass} onClick={() => selectSession(s)} />
                  ))}
                </div>
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Right pane */}
        <div className="w-[60%] overflow-hidden">
          {selected ? (
            <DetailPane session={selected} detail={detail} loading={detailLoading} resuming={resuming} onResume={handleResume} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Clock className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">
                  {loading ? '' : showList ? 'Select a session to view details' : ''}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
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

  // Build metadata rows as [label, value, className?, actionUrl?] tuples
  const rows: [string, string, string?, string?][] = [];
  if (scopeIds.length > 0) rows.push(['Scopes', scopeIds.map((id) => formatScopeId(id)).join(', ')]);
  if (session.actions?.length > 0) rows.push(['Actions', session.actions.map(actionLabel).join(', ')]);
  if (session.summary) rows.push(['Summary', truncate(session.summary, 200)]);
  rows.push(['Started', session.started_at ? format(new Date(session.started_at), 'MMM d, h:mm a') : '—']);
  rows.push(['Ended', session.ended_at ? format(new Date(session.ended_at), 'MMM d, h:mm a') : '—']);
  if (meta?.branch && meta.branch !== 'unknown') rows.push(['Branch', meta.branch, 'font-mono text-xxs']);
  if (meta && meta.fileSize > 0) rows.push(['File size', formatFileSize(meta.fileSize)]);
  if (meta) rows.push(['Plan', meta.slug, 'text-muted-foreground', `/api/orbital/open-file?path=scopes/${meta.slug}.md`]);
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
                <colgroup><col className="w-28" /><col /></colgroup>
                <tbody className="[&_td]:border-b [&_td]:border-border/30 [&_td]:py-2 [&_td]:align-top [&_td:first-child]:pr-3 [&_td:first-child]:text-muted-foreground [&_td:first-child]:whitespace-nowrap [&_td:last-child]:break-all">
                  {rows.map(([label, value, cls, action]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td className={cls}>
                        {action ? (
                          <button
                            onClick={() => { fetch(action, { method: 'POST' }); }}
                            className="inline-flex items-center gap-1.5 hover:text-accent-blue transition-colors"
                            title="Open file"
                          >
                            {value}
                            <ExternalLink className="h-3 w-3 opacity-50" />
                          </button>
                        ) : value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <BulletSection title="Completed" items={discoveries} color="text-bid-green" />
              <BulletSection title="Next Steps" items={nextSteps} color="text-accent-blue" />

              {detail?.stats && <StatsSection stats={detail.stats} />}

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

// ─── Stats Section ─────────────────────────────────────────

function StatsSection({ stats }: { stats: SessionStats }) {
  const { user, assistant, system, timing } = stats;
  const toolEntries = Object.entries(assistant.toolsUsed).sort((a, b) => b[1] - a[1]);

  return (
    <div className="mt-5 space-y-4">
      <Separator />

      {/* Timing */}
      <StatsGroup title="Timing">
        {timing.durationMs > 0 && <StatsRow label="Duration" value={formatDuration(timing.durationMs)} />}
        {timing.firstTimestamp && <StatsRow label="First event" value={format(new Date(timing.firstTimestamp), 'MMM d, h:mm:ss a')} />}
        {timing.lastTimestamp && <StatsRow label="Last event" value={format(new Date(timing.lastTimestamp), 'MMM d, h:mm:ss a')} />}
      </StatsGroup>

      {/* User */}
      <StatsGroup title="User">
        <StatsRow label="Messages" value={`${user.totalMessages - user.metaMessages - user.toolResults} direct, ${user.metaMessages} meta, ${user.toolResults} tool results`} />
        {user.commands.length > 0 && <StatsRow label="Commands" value={user.commands.join(', ')} cls="font-mono" />}
        {user.permissionModes.length > 0 && <StatsRow label="Permission modes" value={user.permissionModes.join(', ')} />}
        {user.version && <StatsRow label="Claude Code version" value={user.version} cls="font-mono" />}
        {user.cwd && <StatsRow label="Working directory" value={user.cwd} cls="font-mono text-xxs" />}
      </StatsGroup>

      {/* Assistant */}
      <StatsGroup title="Assistant">
        <StatsRow label="Responses" value={String(assistant.totalMessages)} />
        {assistant.models.length > 0 && <StatsRow label="Models" value={assistant.models.join(', ')} cls="font-mono" />}
        <StatsRow label="Input tokens" value={formatNumber(assistant.totalInputTokens)} />
        <StatsRow label="Output tokens" value={formatNumber(assistant.totalOutputTokens)} />
        {assistant.totalCacheReadTokens > 0 && <StatsRow label="Cache read tokens" value={formatNumber(assistant.totalCacheReadTokens)} />}
        {assistant.totalCacheCreationTokens > 0 && <StatsRow label="Cache creation tokens" value={formatNumber(assistant.totalCacheCreationTokens)} />}
        {toolEntries.length > 0 && (
          <tr>
            <td className="pr-3 text-muted-foreground whitespace-nowrap align-top">Tools used</td>
            <td>
              <div className="flex flex-wrap gap-1">
                {toolEntries.map(([name, count]) => (
                  <Badge key={name} variant="outline" className="font-mono text-xxs px-1.5 py-0">
                    {name} <span className="ml-1 text-muted-foreground">{count}</span>
                  </Badge>
                ))}
              </div>
            </td>
          </tr>
        )}
      </StatsGroup>

      {/* System */}
      {system.totalMessages > 0 && (
        <StatsGroup title="System">
          <StatsRow label="Events" value={String(system.totalMessages)} />
          {system.subtypes.length > 0 && <StatsRow label="Subtypes" value={system.subtypes.join(', ')} />}
          {system.stopReasons.length > 0 && <StatsRow label="Stop reasons" value={system.stopReasons.join(', ')} />}
          {system.totalDurationMs > 0 && <StatsRow label="Total processing" value={formatDuration(system.totalDurationMs)} />}
          {system.hookCount > 0 && <StatsRow label="Hooks fired" value={`${system.hookCount}${system.hookErrors > 0 ? ` (${system.hookErrors} errors)` : ''}`} />}
        </StatsGroup>
      )}

      {/* Line counts */}
      <StatsGroup title="Raw Counts">
        {Object.entries(stats.typeCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
          <StatsRow key={type} label={type} value={String(count)} />
        ))}
      </StatsGroup>
    </div>
  );
}

function StatsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-xxs font-medium uppercase tracking-wider text-foreground">{title}</h4>
      <table className="w-full table-fixed text-xs">
        <colgroup><col className="w-40" /><col /></colgroup>
        <tbody className="[&_td]:border-b [&_td]:border-border/20 [&_td]:py-1.5 [&_td]:align-top [&_td:first-child]:pr-3 [&_td:first-child]:text-muted-foreground [&_td:first-child]:whitespace-nowrap">
          {children}
        </tbody>
      </table>
    </div>
  );
}

function StatsRow({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <tr>
      <td>{label}</td>
      <td className={cls}>{value}</td>
    </tr>
  );
}

// ─── Shared Helpers ────────────────────────────────────────

function BulletSection({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-5">
      <h4 className="mb-2 text-xxs font-medium uppercase tracking-wider text-foreground">{title}</h4>
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

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remSecs}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}
