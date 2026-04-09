import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import type { ManifestFileEntry } from '@/types';

// ─── Types ──────────────────────────────────────────────────

interface ConfigFileInventoryProps {
  files: ManifestFileEntry[];
  actionLoading: string | null;
  onPin: (file: string) => void;
  onUnpin: (file: string) => void;
  onReset: (file: string) => void;
  onRevert: (file: string) => void;
  onDiff: (file: string, status: ManifestFileEntry['status']) => void;
}

// ─── Main Component ─────────────────────────────────────────

export function ConfigFileInventory({
  files, actionLoading, onPin, onUnpin, onReset, onRevert, onDiff,
}: ConfigFileInventoryProps) {
  const missingFiles = files.filter(f => f.status === 'missing');
  const outdatedFiles = files.filter(f => f.status === 'outdated');
  const modifiedFiles = files.filter(f => f.status === 'modified');
  const pinnedFiles = files.filter(f => f.status === 'pinned');
  const syncedFiles = files.filter(f => f.status === 'synced');
  const userFiles = files.filter(f => f.status === 'user-owned');

  if (files.length === 0) {
    return (
      <div className="text-xs text-muted-foreground/40 py-2 pl-4">
        No tracked files.
      </div>
    );
  }

  return (
    <div className="pl-4 pb-2">
      <FileSection
        title={`Missing (${missingFiles.length})`}
        description="expected but not found on disk"
        files={missingFiles}
        defaultOpen={true}
        renderRow={(f) => (
          <FileRow key={f.path} file={f}>
            <ActionButton label="Restore" variant="cyan" onClick={() => onReset(f.path)} loading={actionLoading === `reset:${f.path}`} />
          </FileRow>
        )}
      />
      <FileSection
        title={`Outdated (${outdatedFiles.length})`}
        description="newer template version available"
        files={outdatedFiles}
        defaultOpen={false}
        renderRow={(f) => (
          <FileRow key={f.path} file={f}>
            <ActionButton label="View changes" onClick={() => onDiff(f.path, f.status)} loading={actionLoading === `diff:${f.path}`} />
            <ActionButton label="Update" variant="cyan" onClick={() => onReset(f.path)} loading={actionLoading === `reset:${f.path}`} />
            {f.hasPrev && <ActionButton label="Revert" onClick={() => onRevert(f.path)} loading={actionLoading === `revert:${f.path}`} />}
          </FileRow>
        )}
      />
      <FileSection
        title={`Modified (${modifiedFiles.length})`}
        description="edited by you"
        files={modifiedFiles}
        defaultOpen={false}
        renderRow={(f) => (
          <FileRow key={f.path} file={f}>
            <ActionButton label="View changes" onClick={() => onDiff(f.path, f.status)} loading={actionLoading === `diff:${f.path}`} />
            <ActionButton label="Reset" onClick={() => onReset(f.path)} loading={actionLoading === `reset:${f.path}`} />
            <ActionButton label="Pin" variant="blue" onClick={() => onPin(f.path)} loading={actionLoading === `pin:${f.path}`} />
            {f.hasPrev && <ActionButton label="Revert" onClick={() => onRevert(f.path)} loading={actionLoading === `revert:${f.path}`} />}
          </FileRow>
        )}
      />
      <FileSection
        title={`Pinned (${pinnedFiles.length})`}
        description="locked from updates"
        files={pinnedFiles}
        defaultOpen={false}
        renderRow={(f) => (
          <FileRow key={f.path} file={f} meta={f.pinnedReason ? `"${f.pinnedReason}"` : undefined}>
            <ActionButton label="View changes" onClick={() => onDiff(f.path, f.status)} loading={actionLoading === `diff:${f.path}`} />
            <ActionButton label="Unpin" onClick={() => onUnpin(f.path)} loading={actionLoading === `unpin:${f.path}`} />
            <ActionButton label="Reset" onClick={() => onReset(f.path)} loading={actionLoading === `reset:${f.path}`} />
            {f.hasPrev && <ActionButton label="Revert" onClick={() => onRevert(f.path)} loading={actionLoading === `revert:${f.path}`} />}
          </FileRow>
        )}
      />
      <FileSection
        title={`Synced (${syncedFiles.length})`}
        description="matches template"
        files={syncedFiles}
        defaultOpen={false}
        renderRow={(f) => (
          <FileRow key={f.path} file={f}>
            {f.hasPrev && <ActionButton label="Revert" onClick={() => onRevert(f.path)} loading={actionLoading === `revert:${f.path}`} />}
          </FileRow>
        )}
      />
      <FileSection
        title={`User (${userFiles.length})`}
        description="your files, not managed"
        files={userFiles}
        defaultOpen={false}
        renderRow={(f) => <FileRow key={f.path} file={f} />}
      />
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────

function FileSection({
  title,
  description,
  files,
  defaultOpen,
  renderRow,
}: {
  title: string;
  description: string;
  files: ManifestFileEntry[];
  defaultOpen: boolean;
  renderRow: (file: ManifestFileEntry) => React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (files.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors mb-1"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span>{title}</span>
        <span className="text-muted-foreground/40 font-normal">{description}</span>
      </button>
      {open && (
        <div className="space-y-1.5 ml-4">
          {files.map(renderRow)}
        </div>
      )}
    </div>
  );
}

function FileRow({
  file,
  meta,
  children,
}: {
  file: ManifestFileEntry;
  meta?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs font-mono text-foreground/70">{file.path}</span>
      {meta && <span className="text-xs text-muted-foreground/40 italic">{meta}</span>}
      {children}
    </div>
  );
}

function ActionButton({
  label,
  variant,
  onClick,
  loading,
}: {
  label: string;
  variant?: 'cyan' | 'blue';
  onClick: () => void;
  loading?: boolean;
}) {
  const base = 'rounded border px-1.5 py-0 text-[10px] leading-5 transition-colors disabled:opacity-40';
  const styles = {
    cyan: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20',
    blue: 'border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20',
    default: 'border-border bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`${base} ${styles[variant ?? 'default']}`}
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin inline mr-1" /> : null}
      {label}
    </button>
  );
}
