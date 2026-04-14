import { useState, useRef, useEffect, useCallback } from 'react';
import { Eye, EyeOff, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ColorPicker } from '@/components/ui/color-picker';
import type { Project } from '@/types';

interface ProjectSettingsModalProps {
  open: boolean;
  onClose: () => void;
  projects: Project[];
}

export function ProjectSettingsModal({ open, onClose, projects }: ProjectSettingsModalProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  async function handleUpdate(id: string, updates: { color?: string; enabled?: boolean; name?: string }) {
    setUpdatingId(id);
    setUpdateError(null);
    try {
      const res = await fetch(`/api/orbital/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setUpdateError(data.error ?? `Failed to update project (HTTP ${res.status})`);
      }
    } catch {
      setUpdateError('Failed to update project');
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-[440px] max-h-[80vh] p-0 gap-0 flex flex-col">
        <DialogHeader className="border-b border-white/[0.08] px-4 py-3">
          <DialogTitle>Project Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Manage registered projects, colors, names, and visibility
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable project list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              updating={updatingId === project.id}
              onUpdate={(updates) => handleUpdate(project.id, updates)}
            />
          ))}

          {updateError && (
            <p className="px-3 text-[11px] text-destructive">{updateError}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Project Row ────────────────────────────────────────────

function ProjectRow({
  project,
  updating,
  onUpdate,
}: {
  project: Project;
  updating: boolean;
  onUpdate: (updates: { color?: string; enabled?: boolean; name?: string }) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(project.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  // Sync name when project prop updates (e.g. after server refresh)
  useEffect(() => {
    if (!editingName) {
      setNameValue(project.name);
    }
  }, [project.name, editingName]);

  const isDirty = nameValue.trim() !== '' && nameValue.trim() !== project.name;

  const commitName = useCallback(() => {
    setEditingName(false);
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== project.name) {
      onUpdate({ name: trimmed });
    } else {
      setNameValue(project.name);
    }
  }, [nameValue, project.name, onUpdate]);

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded border border-white/[0.08] px-3 py-2',
        'transition-colors hover:border-[rgba(var(--neon-cyan),0.2)]',
        !project.enabled && 'opacity-50',
      )}
    >
      {/* Color picker */}
      <ColorPicker
        value={project.color}
        onChange={(color) => onUpdate({ color })}
        disabled={updating}
      />

      {/* Name (editable) and path */}
      <div className="flex-1 min-w-0">
        {editingName ? (
          <div className="flex items-center gap-1">
            <input
              ref={nameInputRef}
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={() => { setNameValue(project.name); setEditingName(false); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName();
                if (e.key === 'Escape') { setNameValue(project.name); setEditingName(false); }
              }}
              className="flex-1 min-w-0 bg-transparent text-xs font-medium outline-none border-b border-primary/50 pb-0.5"
            />
            {isDirty && (
              <button
                onMouseDown={(e) => { e.preventDefault(); commitName(); }}
                className="shrink-0 text-primary hover:text-primary/80 transition-colors"
                title="Save name"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : (
          <div
            className="text-xs font-medium truncate cursor-text hover:text-primary transition-colors"
            onClick={() => setEditingName(true)}
            title="Click to rename"
          >
            {project.name}
          </div>
        )}
        <div className="text-[10px] text-muted-foreground/60 font-mono truncate">{project.path}</div>
      </div>

      {/* Visibility toggle */}
      <button
        onClick={() => onUpdate({ enabled: !project.enabled })}
        disabled={updating}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        title={project.enabled ? 'Hide project' : 'Show project'}
      >
        {project.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

