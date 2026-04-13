import { useState, useEffect, useCallback, useMemo } from 'react';
import { ExternalLink, X as XIcon, Plus } from 'lucide-react';
import { useProjectUrl } from '@/hooks/useProjectUrl';
import { useProjects } from '@/hooks/useProjectContext';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { SessionPanel } from '@/components/SessionPanel';
import { ScopeSectionList } from '@/components/scope-sections/ScopeSectionList';
import { parseScopeSections } from '@/lib/scope-sections';
import { useScopeSessions } from '@/hooks/useScopeSessions';
import { useWorkflow } from '@/hooks/useWorkflow';
import { formatScopeId } from '@/lib/utils';
import type { Scope } from '@/types';
import { PRIORITY_OPTIONS, EFFORT_BUCKETS, CATEGORY_OPTIONS } from '@/types';

interface ScopeDetailModalProps {
  scope: Scope | null;
  open: boolean;
  onClose: () => void;
}

interface EditableFields {
  title: string;
  status: string;
  priority: string;
  effort_estimate: string;
  category: string;
  tags: string[];
  blocked_by: number[];
  blocks: number[];
}

const SELECT_CLS = 'h-7 w-full rounded border border-border bg-transparent px-2 text-xxs text-foreground/80 focus:outline-none focus:ring-1 focus:ring-primary/50';
const LABEL_CLS = 'text-xxs font-medium uppercase tracking-wide text-muted-foreground/70 mb-1';

function fieldsFromScope(scope: Scope): EditableFields {
  return {
    title: scope.title, status: scope.status,
    priority: scope.priority ?? '', effort_estimate: scope.effort_estimate ?? '',
    category: scope.category ?? '', tags: [...scope.tags],
    blocked_by: [...scope.blocked_by], blocks: [...scope.blocks],
  };
}

function fieldsEqual(a: EditableFields, b: EditableFields): boolean {
  return a.title === b.title && a.status === b.status &&
    a.priority === b.priority && a.effort_estimate === b.effort_estimate &&
    a.category === b.category && JSON.stringify(a.tags) === JSON.stringify(b.tags) &&
    JSON.stringify(a.blocked_by) === JSON.stringify(b.blocked_by) &&
    JSON.stringify(a.blocks) === JSON.stringify(b.blocks);
}

function DepEditor({ label, ids, onRemove, onAdd }: {
  label: string; ids: number[];
  onRemove: (id: number) => void; onAdd: (val: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  return (
    <div>
      <p className={LABEL_CLS}>{label}</p>
      <div className="flex flex-wrap items-center gap-1">
        {ids.map((id) => (
          <span key={id} className="group inline-flex items-center gap-0.5 rounded border border-border px-1.5 py-0.5 text-xxs text-foreground/70">
            {formatScopeId(id)}
            <button onClick={() => onRemove(id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
              <XIcon className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        {editing ? (
          <input autoFocus className="h-5 w-12 rounded bg-transparent px-1 text-xxs border border-primary/30 focus:outline-none"
            placeholder="ID" value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { onAdd(val); setEditing(false); setVal(''); } if (e.key === 'Escape') setEditing(false); }}
            onBlur={() => setEditing(false)} />
        ) : (
          <button onClick={() => setEditing(true)} className="hover:text-foreground transition-colors text-muted-foreground">
            <Plus className="h-3 w-3" />
          </button>
        )}
        {ids.length === 0 && !editing && <span className="text-xxs text-muted-foreground/50">None</span>}
      </div>
    </div>
  );
}

export function ScopeDetailModal({ scope, open, onClose }: ScopeDetailModalProps) {
  const { engine } = useWorkflow();
  const buildUrl = useProjectUrl();
  const { getApiBase, hasMultipleProjects } = useProjects();
  const scopeUrl = useCallback((path: string) => {
    if (hasMultipleProjects && scope?.project_id) {
      return `${getApiBase(scope.project_id)}${path}`;
    }
    return buildUrl(path);
  }, [buildUrl, getApiBase, hasMultipleProjects, scope?.project_id]);
  const { sessions, loading: sessionsLoading } = useScopeSessions(scope?.id ?? null);
  const [fields, setFields] = useState<EditableFields | null>(null);
  const [saved, setSaved] = useState<EditableFields | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');

  const isDirty = fields && saved ? !fieldsEqual(fields, saved) : false;

  // Parse sections from raw content
  const sections = useMemo(() => parseScopeSections(scope?.raw_content), [scope?.raw_content]);

  useEffect(() => {
    if (scope && open) {
      const f = fieldsFromScope(scope);
      setFields(f); setSaved(f); setError(null); setTagInput('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- scope?.id and scope?.updated_at are the relevant change triggers
  }, [scope?.id, scope?.updated_at, open]);

  const save = useCallback(async () => {
    if (!scope || !fields || !isDirty || saving) return;
    setSaving(true); setError(null);
    try {
      const payload: Record<string, unknown> = {};
      if (saved) {
        if (fields.title !== saved.title) payload.title = fields.title;
        if (fields.status !== saved.status) payload.status = fields.status;
        if (fields.priority !== saved.priority) payload.priority = fields.priority || null;
        if (fields.effort_estimate !== saved.effort_estimate) payload.effort_estimate = fields.effort_estimate || null;
        if (fields.category !== saved.category) payload.category = fields.category || null;
        if (JSON.stringify(fields.tags) !== JSON.stringify(saved.tags)) payload.tags = fields.tags;
        if (JSON.stringify(fields.blocked_by) !== JSON.stringify(saved.blocked_by)) payload.blocked_by = fields.blocked_by;
        if (JSON.stringify(fields.blocks) !== JSON.stringify(saved.blocks)) payload.blocks = fields.blocks;
      }
      const res = await fetch(scopeUrl(`/scopes/${scope.id}`), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Save failed' }));
        setError(body.error ?? `HTTP ${res.status}`); return;
      }
      setSaved({ ...fields });
    } catch { setError('Network error — could not save'); }
    finally { setSaving(false); }
  }, [scope, fields, saved, isDirty, saving, scopeUrl]);

  function handleClose() {
    if (isDirty && window.confirm('Save changes before closing?')) { save().then(onClose); return; }
    onClose();
  }

  function update(partial: Partial<EditableFields>) {
    setFields((prev) => prev ? { ...prev, ...partial } : prev); setError(null);
  }

  function addTag(tag: string) {
    const t = tag.trim().toLowerCase();
    if (!t || !fields) return;
    if (!fields.tags.includes(t)) update({ tags: [...fields.tags, t] });
    setTagInput('');
  }

  function addDep(field: 'blocked_by' | 'blocks', value: string) {
    const num = parseInt(value, 10);
    if (isNaN(num) || num <= 0 || !fields) return;
    if (!fields[field].includes(num)) update({ [field]: [...fields[field], num] });
  }

  if (!scope || !fields) return null;

  const validTargets = engine.getValidTargets(scope.status);
  const statusOptions = [scope.status, ...validTargets.filter((t) => t !== scope.status)];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent className="max-w-[min(72rem,calc(100vw_-_2rem))] h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* ── Header: scope ID + title + file path ── */}
        <DialogHeader className="px-4 pt-3 pb-2">
          <div className="flex items-start gap-3 pr-8">
            <span className="font-mono text-xxs text-muted-foreground mt-1.5">{formatScopeId(scope.id)}</span>
            <div className="min-w-0 flex-1">
              <DialogTitle asChild>
                <input className="w-full bg-transparent text-sm font-normal text-foreground border-none focus:outline-none focus:ring-0 placeholder:text-muted-foreground leading-tight"
                  value={fields.title} onChange={(e) => update({ title: e.target.value })} placeholder="Scope title..." />
              </DialogTitle>
              <DialogDescription asChild>
                <span className="mt-1 flex items-center gap-1 text-xxs text-muted-foreground">
                  <ExternalLink className="h-3 w-3" />
                  <span className="truncate max-w-[400px]">{scope.file_path}</span>
                </span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Separator />

        {error && (
          <div className="mx-4 mt-2 flex items-center gap-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-400">
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="shrink-0 hover:text-red-200 transition-colors"><XIcon className="h-3.5 w-3.5" /></button>
          </div>
        )}

        {/* ── Body: content (left) + right rail ── */}
        <div className="flex flex-1 min-h-0">
          {/* Left panel — sectioned content or fallback markdown */}
          <div className="flex-[65] min-w-0 border-r">
            <ScrollArea className="h-full">
              {sections ? (
                <div className="py-2">
                  <ScopeSectionList sections={sections} />
                </div>
              ) : (
                <div className="px-6 py-5">
                  {scope.raw_content ? <MarkdownRenderer content={scope.raw_content} /> : (
                    <p className="text-xs text-muted-foreground italic">No content available</p>
                  )}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Right rail — metadata + sessions */}
          <div className="flex-[35] min-w-0 flex flex-col">
            <ScrollArea className="h-full">
              {/* Metadata editor */}
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className={LABEL_CLS}>Status</p>
                    <select className={SELECT_CLS} value={fields.status} onChange={(e) => update({ status: e.target.value })}>
                      {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <p className={LABEL_CLS}>Priority</p>
                    <select className={SELECT_CLS} value={fields.priority} onChange={(e) => update({ priority: e.target.value })}>
                      <option value="">—</option>
                      {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <p className={LABEL_CLS}>Effort</p>
                    <select className={SELECT_CLS} value={fields.effort_estimate} onChange={(e) => update({ effort_estimate: e.target.value })}>
                      <option value="">—</option>
                      {EFFORT_BUCKETS.map((e) => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>
                  <div>
                    <p className={LABEL_CLS}>Category</p>
                    <select className={SELECT_CLS} value={fields.category} onChange={(e) => update({ category: e.target.value })}>
                      <option value="">—</option>
                      {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <p className={LABEL_CLS}>Tags</p>
                  <div className="flex flex-wrap items-center gap-1">
                    {fields.tags.map((tag) => (
                      <span key={tag} className="group inline-flex items-center gap-0.5 glass-pill rounded border border-border px-1.5 py-0.5 text-xxs text-muted-foreground">
                        {tag}
                        <button onClick={() => update({ tags: fields.tags.filter((t) => t !== tag) })} className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <XIcon className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                    <input className="h-5 w-16 rounded bg-transparent text-xxs text-muted-foreground placeholder:text-muted-foreground/50 border-none focus:outline-none"
                      placeholder="+tag" value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } }}
                      onBlur={() => { if (tagInput.trim()) addTag(tagInput); }} />
                  </div>
                </div>

                {/* Dependencies */}
                <DepEditor label="Blocked by" ids={fields.blocked_by}
                  onRemove={(id) => update({ blocked_by: fields.blocked_by.filter((d) => d !== id) })}
                  onAdd={(v) => addDep('blocked_by', v)} />
                <DepEditor label="Blocks" ids={fields.blocks}
                  onRemove={(id) => update({ blocks: fields.blocks.filter((d) => d !== id) })}
                  onAdd={(v) => addDep('blocks', v)} />
              </div>

              <Separator />

              {/* Session history */}
              <div className="p-4 flex-1">
                <SessionPanel sessions={sessions} loading={sessionsLoading} />
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* ── Unsaved changes bar ── */}
        {isDirty && (
          <div className="mx-4 mb-2 flex items-center gap-2 rounded border border-border px-3 py-2">
            <Badge variant="outline">Unsaved changes</Badge>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={() => { setFields(saved); setError(null); }}>Discard</Button>
            <Button size="sm" onClick={() => save()} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
            {error && <span className="text-xs text-destructive ml-2">{error}</span>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
