import { useState, useEffect, useCallback, useRef } from 'react';
import { Trash2, Check, X, Sparkles } from 'lucide-react';
import { useProjectUrl } from '@/hooks/useProjectUrl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Scope } from '@/types';

interface IdeaDetailModalProps {
  scope: Scope | null;
  open: boolean;
  onClose: () => void;
  onDelete: (slug: string) => void;
  onApprove: (slug: string) => void;
  onReject: (slug: string) => void;
}

export function IdeaDetailModal({ scope, open, onClose, onDelete, onApprove, onReject }: IdeaDetailModalProps) {
  const buildUrl = useProjectUrl();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [savedTitle, setSavedTitle] = useState('');
  const [savedDescription, setSavedDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const isGhost = !!scope?.is_ghost;
  const isDirty = title !== savedTitle || description !== savedDescription;

  // Sync state when scope changes
  useEffect(() => {
    if (scope && open) {
      const t = scope.title ?? '';
      const d = scope.raw_content ?? '';
      setTitle(t);
      setDescription(d);
      setSavedTitle(t);
      setSavedDescription(d);
      setConfirmDelete(false);
      if (!isGhost) setTimeout(() => titleRef.current?.focus(), 100);
    }
  }, [scope?.id, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(async () => {
    if (!scope?.slug || !isDirty || saving || isGhost) return;
    setSaving(true);
    try {
      const res = await fetch(buildUrl(`/ideas/${scope.slug}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      });
      if (res.ok) {
        setSavedTitle(title);
        setSavedDescription(description);
      } else {
        console.error('[Orbital] Failed to save idea:', res.status, res.statusText);
      }
    } finally {
      setSaving(false);
    }
  }, [scope, title, description, isDirty, saving, isGhost, buildUrl]);

  // Auto-save every 10s when dirty (not for ghosts)
  useEffect(() => {
    if (!isDirty || !open || isGhost) return;
    const timer = setInterval(() => { save(); }, 10_000);
    return () => clearInterval(timer);
  }, [isDirty, open, save, isGhost]);

  function handleClose() {
    if (isDirty && !isGhost) {
      if (window.confirm('Save changes before closing?')) {
        save().then(onClose);
        return;
      }
    }
    onClose();
  }

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (scope?.slug) onDelete(scope.slug);
  }

  if (!scope) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent className="max-w-md p-0 gap-0 flex flex-col max-h-[70vh]">
        {/* Header */}
        <DialogHeader className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 pr-8">
            <div className="flex-1 min-w-0">
              {isGhost ? (
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                  <span className="text-sm font-normal text-foreground truncate">{title}</span>
                </div>
              ) : (
                <input
                  ref={titleRef}
                  className="w-full bg-transparent text-sm font-normal text-foreground border-none focus:outline-none focus:ring-0 placeholder:text-muted-foreground"
                  placeholder="Idea title..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              )}
            </div>
            {isGhost ? (
              <span className="shrink-0 rounded border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[10px] text-purple-400 uppercase">
                ai suggestion
              </span>
            ) : confirmDelete ? (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="destructive" className="h-6 text-xxs" onClick={handleDelete}>
                  Confirm
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-xxs" onClick={() => setConfirmDelete(false)}>
                  No
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={handleDelete}
                title="Delete idea"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* Description */}
        <div className="flex-1 min-h-0 px-4 pb-4">
          {isGhost ? (
            <div className="w-full min-h-[200px] rounded bg-muted/20 px-3 py-2.5 text-xs text-foreground/80 border border-border/50 whitespace-pre-wrap">
              {description || <span className="text-muted-foreground italic">No description</span>}
            </div>
          ) : (
            <textarea
              className="w-full h-full min-h-[200px] rounded bg-muted/30 px-3 py-2.5 text-xs text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none placeholder:text-muted-foreground"
              placeholder="Describe the idea... What problem does it solve? Any notes on approach?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </div>

        {/* Footer */}
        {isGhost ? (
          <div className="px-4 pb-3 flex items-center gap-2">
            <Button
              size="sm"
              className="flex-1 bg-green-600/20 border border-green-500/30 text-green-400 hover:bg-green-600/30 hover:text-green-300"
              onClick={() => scope.slug && onApprove(scope.slug)}
              disabled={!scope.slug}
            >
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
              onClick={() => scope.slug && onReject(scope.slug)}
              disabled={!scope.slug}
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              Reject
            </Button>
          </div>
        ) : (
          <div className="px-4 pb-3 flex items-center justify-between text-xxs text-muted-foreground">
            <span>
              {saving ? 'Saving...' : isDirty ? 'Unsaved changes' : 'Saved'}
            </span>
            <Button size="sm" variant="ghost" className="h-6" onClick={() => save()} disabled={!isDirty || saving}>
              Save
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
