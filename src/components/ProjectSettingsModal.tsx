import { useState, useRef, useEffect, useCallback } from 'react';
import { Eye, EyeOff, FolderPlus, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { PROJECT_COLORS } from '../../shared/project-colors';
import type { Project } from '@/types';

interface ProjectSettingsModalProps {
  open: boolean;
  onClose: () => void;
  projects: Project[];
}

export function ProjectSettingsModal({ open, onClose, projects }: ProjectSettingsModalProps) {
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

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

  async function handleFolderSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    const firstPath = files[0].webkitRelativePath;
    const folderName = firstPath.split('/')[0];
    setAddError(null);
    setAdding(true);
    try {
      const res = await fetch('/api/orbital/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folderName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add project');
    } finally {
      setAdding(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-[440px] max-h-[80vh] p-0 gap-0 flex flex-col">
        <DialogHeader className="border-b border-white/[0.08] px-4 py-3">
          <DialogTitle>Project Settings</DialogTitle>
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

          {/* Add project — ghost row */}
          <div
            onClick={() => !adding && folderInputRef.current?.click()}
            className={cn(
              'flex items-center gap-3 rounded border border-dashed border-white/[0.08] px-3 py-2',
              'text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-white/[0.03]',
              'transition-colors cursor-pointer',
              adding && 'opacity-50 pointer-events-none',
            )}
          >
            <FolderPlus className="h-3.5 w-3.5 shrink-0" />
            <span className="text-xs">Add Project</span>
          </div>
          <input
            ref={folderInputRef}
            type="file"
            // @ts-expect-error webkitdirectory is non-standard but widely supported
            webkitdirectory=""
            className="hidden"
            onChange={(e) => handleFolderSelected(e.target.files)}
          />
          {(addError || updateError) && (
            <p className="px-3 text-[11px] text-destructive">{addError || updateError}</p>
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
  }, [project.name]); // eslint-disable-line react-hooks/exhaustive-deps

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

// ─── Color Picker (Popover) ─────────────────────────────────

function ColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          className="h-5 w-5 rounded-full border border-white/20 shrink-0 transition-shadow hover:shadow-[0_0_8px_currentColor] disabled:opacity-50"
          style={{ backgroundColor: `hsl(${value})` }}
          title="Change color"
        />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-auto p-2">
        <div className="grid grid-cols-5 gap-2">
          {PROJECT_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => onChange(color)}
              className={cn(
                'h-6 w-6 rounded-full border-2 transition-transform hover:scale-110',
                color === value
                  ? 'border-white shadow-[0_0_8px_hsl(var(--primary))]'
                  : 'border-transparent hover:border-white/40',
              )}
              style={{ backgroundColor: `hsl(${color})` }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
