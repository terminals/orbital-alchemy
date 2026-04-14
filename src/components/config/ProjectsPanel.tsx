import { useState, useRef, useEffect, useCallback } from 'react';
import { Eye, EyeOff, Check, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ColorPicker } from '@/components/ui/color-picker';
import { useProjects } from '@/hooks/useProjectContext';
import type { Project } from '@/types';

export function ProjectsPanel() {
  const { projects } = useProjects();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

  async function handleDelete(id: string) {
    setUpdatingId(id);
    setUpdateError(null);
    try {
      const res = await fetch(`/api/orbital/projects/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setUpdateError(data.error ?? `Failed to remove project (HTTP ${res.status})`);
      }
    } catch {
      setUpdateError('Failed to remove project');
    } finally {
      setUpdatingId(null);
      setConfirmDeleteId(null);
    }
  }

  return (
    <section className="card-glass settings-panel rounded-xl p-5">
      <h2 className="text-sm font-medium uppercase tracking-wider text-primary mb-5">
        Projects
      </h2>

      <div className="space-y-2">
        {projects.map((project) => (
          <ProjectRow
            key={project.id}
            project={project}
            updating={updatingId === project.id}
            confirmDelete={confirmDeleteId === project.id}
            onUpdate={(updates) => handleUpdate(project.id, updates)}
            onDeleteRequest={() => setConfirmDeleteId(project.id)}
            onDeleteConfirm={() => handleDelete(project.id)}
            onDeleteCancel={() => setConfirmDeleteId(null)}
          />
        ))}

        {updateError && (
          <p className="text-[11px] text-destructive">{updateError}</p>
        )}
      </div>
    </section>
  );
}

// ─── Project Row ────────────────────────────────────────────

function ProjectRow({
  project,
  updating,
  confirmDelete,
  onUpdate,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
}: {
  project: Project;
  updating: boolean;
  confirmDelete: boolean;
  onUpdate: (updates: { color?: string; enabled?: boolean; name?: string }) => void;
  onDeleteRequest: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(project.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  useEffect(() => {
    if (!editingName) setNameValue(project.name);
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

  const statusColor = project.status === 'active'
    ? 'bg-green-400'
    : project.status === 'error'
      ? 'bg-red-400'
      : 'bg-muted-foreground/40';

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded border border-white/[0.08] px-3 py-2',
        'transition-colors hover:border-[rgba(var(--neon-cyan),0.2)]',
        !project.enabled && 'opacity-50',
      )}
    >
      {/* Left: color + name + path + status */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <ColorPicker
          value={project.color}
          onChange={(color) => onUpdate({ color })}
          disabled={updating}
        />

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

        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', statusColor)} title={project.status} />
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
        {confirmDelete ? (
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="text-destructive">Remove?</span>
            <button
              onClick={onDeleteConfirm}
              disabled={updating}
              className="text-destructive hover:text-destructive/80 font-medium transition-colors disabled:opacity-50"
            >
              Yes
            </button>
            <button
              onClick={onDeleteCancel}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              No
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => onUpdate({ enabled: !project.enabled })}
              disabled={updating}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              title={project.enabled ? 'Disable project' : 'Enable project'}
            >
              {project.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={onDeleteRequest}
              disabled={updating}
              className="shrink-0 text-muted-foreground/50 hover:text-destructive transition-colors disabled:opacity-50"
              title="Remove project"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

