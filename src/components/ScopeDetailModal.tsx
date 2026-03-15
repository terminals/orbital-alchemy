import { useState, useEffect, useCallback } from 'react';
import { ExternalLink, X as XIcon, Plus } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { SessionPanel } from '@/components/SessionPanel';
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

const SELECT_CLS = 'h-6 rounded border border-border bg-muted/30 px-1.5 text-xxs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50';

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
    <span className="inline-flex items-center gap-1">
      {label}:
      {ids.map((id) => (
        <span key={id} className="group inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0.5">
          {formatScopeId(id)}
          <button onClick={() => onRemove(id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
            <XIcon className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      {editing ? (
        <input autoFocus className="h-5 w-12 rounded bg-muted/50 px-1 text-xxs border border-primary/30 focus:outline-none"
          placeholder="ID" value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { onAdd(val); setEditing(false); setVal(''); } if (e.key === 'Escape') setEditing(false); }}
          onBlur={() => setEditing(false)} />
      ) : (
        <button onClick={() => setEditing(true)} className="hover:text-foreground transition-colors"><Plus className="h-3 w-3" /></button>
      )}
    </span>
  );
}

export function ScopeDetailModal({ scope, open, onClose }: ScopeDetailModalProps) {
  const { engine } = useWorkflow();
  const { sessions, loading: sessionsLoading } = useScopeSessions(scope?.id ?? null);
  const [fields, setFields] = useState<EditableFields | null>(null);
  const [saved, setSaved] = useState<EditableFields | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');

  const isDirty = fields && saved ? !fieldsEqual(fields, saved) : false;

  useEffect(() => {
    if (scope && open) {
      const f = fieldsFromScope(scope);
      setFields(f); setSaved(f); setError(null); setTagInput('');
    }
  }, [scope?.id, scope?.updated_at, open]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const res = await fetch(`/api/orbital/scopes/${scope.id}`, {
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
  }, [scope, fields, saved, isDirty, saving]);

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
        <DialogHeader className="px-4 pt-3 pb-2">
          <div className="flex items-start gap-3 pr-8">
            <span className="font-mono text-xxs text-muted-foreground mt-1.5">{formatScopeId(scope.id)}</span>
            <div className="min-w-0 flex-1">
              <DialogTitle asChild>
                <input className="w-full bg-transparent text-sm font-normal text-foreground border-none focus:outline-none focus:ring-0 placeholder:text-muted-foreground leading-tight"
                  value={fields.title} onChange={(e) => update({ title: e.target.value })} placeholder="Scope title..." />
              </DialogTitle>
              <DialogDescription asChild>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select className={SELECT_CLS} value={fields.status} onChange={(e) => update({ status: e.target.value })}>
                    {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select className={SELECT_CLS} value={fields.priority} onChange={(e) => update({ priority: e.target.value })}>
                    <option value="">priority</option>
                    {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <select className={SELECT_CLS} value={fields.effort_estimate} onChange={(e) => update({ effort_estimate: e.target.value })}>
                    <option value="">effort</option>
                    {EFFORT_BUCKETS.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                  <select className={SELECT_CLS} value={fields.category} onChange={(e) => update({ category: e.target.value })}>
                    <option value="">category</option>
                    {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {fields.tags.map((tag) => (
                    <span key={tag} className="group inline-flex items-center gap-0.5 glass-pill rounded bg-muted px-1.5 py-0.5 text-xxs text-muted-foreground">
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
              </DialogDescription>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xxs text-muted-foreground">
            <DepEditor label="Blocked by" ids={fields.blocked_by}
              onRemove={(id) => update({ blocked_by: fields.blocked_by.filter((d) => d !== id) })}
              onAdd={(v) => addDep('blocked_by', v)} />
            <DepEditor label="Blocks" ids={fields.blocks}
              onRemove={(id) => update({ blocks: fields.blocks.filter((d) => d !== id) })}
              onAdd={(v) => addDep('blocks', v)} />
            <span className="flex items-center gap-1">
              <ExternalLink className="h-3 w-3" />
              <span className="truncate max-w-[300px]">{scope.file_path}</span>
            </span>
          </div>
        </DialogHeader>

        <Separator />

        {error && (
          <div className="mx-4 mt-2 flex items-center gap-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-400">
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="shrink-0 hover:text-red-200 transition-colors"><XIcon className="h-3.5 w-3.5" /></button>
          </div>
        )}

        <div className="flex flex-1 min-h-0">
          <div className="flex-[6] min-w-0 border-r bg-[#0a0a12]">
            <ScrollArea className="h-full">
              <div className="px-6 py-5">
                {scope.raw_content ? <MarkdownRenderer content={scope.raw_content} /> : (
                  <p className="text-xs text-muted-foreground italic">No content available</p>
                )}
              </div>
            </ScrollArea>
          </div>
          <div className="flex-[4] min-w-0">
            <div className="flex h-full flex-col p-4">
              <SessionPanel sessions={sessions} loading={sessionsLoading} />
            </div>
          </div>
        </div>

        <div className="px-4 py-2 flex items-center justify-between border-t border-border/50 text-xxs text-muted-foreground">
          <span>{saving ? 'Saving...' : isDirty ? 'Unsaved changes' : 'All changes saved'}</span>
          <Button size="sm" variant="ghost" className="h-6" onClick={() => save()} disabled={!isDirty || saving}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
