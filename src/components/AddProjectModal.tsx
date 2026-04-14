import { useState, useEffect, useRef, useCallback } from 'react';
import {
  FolderOpen,
  Check,
  Loader2,
  AlertTriangle,
  Github,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { ColorPicker } from '@/components/ui/color-picker';
import { cn } from '@/lib/utils';
import { PROJECT_COLORS } from '../../shared/project-colors';
import { WORKFLOW_PRESETS } from '../../shared/workflow-presets';
import { useProjects } from '@/hooks/useProjectContext';

interface AddProjectModalProps {
  open: boolean;
  onClose: () => void;
  /** When true, the modal cannot be dismissed (first-time setup) */
  blocking?: boolean;
}

type GitStatus = 'idle' | 'checking' | 'found' | 'missing';
type PathStatus = 'idle' | 'checking' | 'valid' | 'invalid';

export function AddProjectModal({ open, onClose, blocking }: AddProjectModalProps) {
  const { projects } = useProjects();

  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [preset, setPreset] = useState('default');
  const [initGit, setInitGit] = useState(false);

  const [pathStatus, setPathStatus] = useState<PathStatus>('idle');
  const [pathError, setPathError] = useState<string | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus>('idle');
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  const [browsing, setBrowsing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const checkPathTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Pick the next unused color when the modal opens
  useEffect(() => {
    if (!open) return;
    const usedColors = projects.map(p => p.color);
    const available = PROJECT_COLORS.filter(c => !usedColors.includes(c));
    setColor(available[0] ?? PROJECT_COLORS[0]);
    setName('');
    setFolderPath('');
    setPreset('default');
    setInitGit(false);
    setPathStatus('idle');
    setPathError(null);
    setGitStatus('idle');
    setAlreadyRegistered(false);
    setCreateError(null);
    setBrowsing(false);
    setCreating(false);
  }, [open, projects]);

  // Validate path (debounced)
  const validatePath = useCallback((pathValue: string) => {
    if (checkPathTimer.current) clearTimeout(checkPathTimer.current);
    if (abortRef.current) abortRef.current.abort();

    if (!pathValue.trim()) {
      setPathStatus('idle');
      setPathError(null);
      setGitStatus('idle');
      setAlreadyRegistered(false);
      return;
    }

    setPathStatus('checking');
    setPathError(null);
    setGitStatus('checking');

    checkPathTimer.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch('/api/orbital/projects/check-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: pathValue }),
          signal: controller.signal,
        });
        const data = await res.json();

        if (controller.signal.aborted) return;

        if (data.valid) {
          setPathStatus('valid');
          setPathError(null);
          setGitStatus(data.hasGit ? 'found' : 'missing');
          setAlreadyRegistered(data.alreadyRegistered ?? false);
          // Auto-fill name if empty
          if (!name.trim() && data.suggestedName) {
            setName(data.suggestedName);
          }
        } else {
          setPathStatus('invalid');
          setPathError(data.error ?? 'Invalid path');
          setGitStatus('idle');
          setAlreadyRegistered(false);
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setPathStatus('invalid');
        setPathError('Failed to validate path');
        setGitStatus('idle');
      }
    }, 400);
  }, [name]);

  // Handle folder path text change
  function handlePathChange(value: string) {
    setFolderPath(value);
    validatePath(value);
  }

  // Browse for folder (macOS native dialog)
  async function handleBrowse() {
    setBrowsing(true);
    try {
      const res = await fetch('/api/orbital/projects/browse', { method: 'POST' });
      const data = await res.json();

      if (data.path) {
        setFolderPath(data.path);
        validatePath(data.path);
      }
      // cancelled or not_supported — do nothing
    } catch {
      // Silently fail — user can type path manually
    } finally {
      setBrowsing(false);
    }
  }

  // Create project
  async function handleCreate() {
    setCreating(true);
    setCreateError(null);

    try {
      const res = await fetch('/api/orbital/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: folderPath.trim(),
          name: name.trim(),
          color,
          preset,
          initGit: gitStatus === 'missing' && initGit,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed to create project (HTTP ${res.status})`);
      }

      // Success — close modal. useProjectContext auto-refreshes via socket.
      onClose();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreating(false);
    }
  }

  const canCreate =
    name.trim() !== '' &&
    pathStatus === 'valid' &&
    !alreadyRegistered &&
    !creating;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !blocking) onClose();
      }}
    >
      <DialogContent
        className="max-w-[480px] max-h-[90vh] p-0 gap-0 flex flex-col"
        onPointerDownOutside={(e) => { if (blocking) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (blocking) e.preventDefault(); }}
        hideCloseButton={blocking}
      >
        <DialogHeader className="border-b border-white/[0.08] px-5 py-4">
          <DialogTitle>Add Project</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Set up a new project for Orbital Command
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Project Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Project Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
              className="w-full rounded border border-white/[0.12] bg-white/[0.04] px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/40 focus:border-primary/50 transition-colors"
            />
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Color
            </label>
            <div className="flex items-center gap-3">
              <ColorPicker value={color} onChange={setColor} />
              <span className="text-xs text-muted-foreground">
                Click to change
              </span>
            </div>
          </div>

          {/* Folder Path */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Project Location
            </label>
            <div className="flex items-center gap-2">
              <input
                value={folderPath}
                onChange={(e) => handlePathChange(e.target.value)}
                placeholder="/Users/you/Code/my-project"
                className={cn(
                  'flex-1 rounded border bg-white/[0.04] px-3 py-2 text-sm font-mono outline-none placeholder:text-muted-foreground/40 transition-colors',
                  pathStatus === 'valid' && !alreadyRegistered
                    ? 'border-green-500/30'
                    : pathStatus === 'invalid'
                      ? 'border-destructive/30'
                      : 'border-white/[0.12] focus:border-primary/50',
                )}
              />
              <button
                onClick={handleBrowse}
                disabled={browsing}
                className={cn(
                  'flex items-center gap-1.5 rounded border border-white/[0.12] px-3 py-2 text-xs font-medium',
                  'transition-colors hover:bg-white/[0.06] hover:border-primary/30',
                  'disabled:opacity-50 disabled:pointer-events-none',
                )}
              >
                {browsing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FolderOpen className="h-3.5 w-3.5" />
                )}
                {browsing ? 'Opening...' : 'Browse'}
              </button>
            </div>
            {pathError && (
              <p className="text-[11px] text-destructive">{pathError}</p>
            )}
            {alreadyRegistered && (
              <p className="text-[11px] text-amber-400">This project is already registered</p>
            )}
          </div>

          {/* Git Status */}
          {gitStatus !== 'idle' && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Git Repository
              </label>
              {gitStatus === 'checking' && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Checking...
                </div>
              )}
              {gitStatus === 'found' && (
                <div className="flex items-center gap-2 text-xs text-green-400">
                  <Check className="h-3.5 w-3.5" />
                  Git repository detected
                </div>
              )}
              {gitStatus === 'missing' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    No git repository found
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={initGit}
                      onChange={(e) => setInitGit(e.target.checked)}
                      className="rounded border-white/20"
                    />
                    <span className="text-xs text-muted-foreground">
                      Initialize a git repository
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Workflow Preset */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Workflow
            </label>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              className="w-full rounded border border-white/[0.12] bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-primary/50 transition-colors [&>option]:bg-background"
            >
              {WORKFLOW_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground/60">
              {WORKFLOW_PRESETS.find(p => p.value === preset)?.hint}
            </p>
          </div>

          {/* GitHub placeholder */}
          <div className="pt-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  disabled
                  className="flex items-center gap-2 rounded border border-white/[0.08] px-3 py-2 text-xs text-muted-foreground/40 cursor-not-allowed w-full"
                >
                  <Github className="h-3.5 w-3.5" />
                  Connect GitHub
                  <span className="ml-auto text-[10px] bg-white/[0.06] px-1.5 py-0.5 rounded">
                    Coming soon
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Clone a repository from GitHub — coming in a future update
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/[0.08] px-5 py-4 space-y-2">
          {createError && (
            <p className="text-[11px] text-destructive">{createError}</p>
          )}
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            className={cn(
              'w-full rounded px-4 py-2.5 text-sm font-medium transition-all',
              canCreate
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_12px_hsl(var(--primary)/0.3)]'
                : 'bg-white/[0.06] text-muted-foreground/40 cursor-not-allowed',
            )}
          >
            {creating ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating project...
              </span>
            ) : (
              'Create Project'
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
