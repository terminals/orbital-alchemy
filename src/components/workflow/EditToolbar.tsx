import {
  Plus, GitBranch, Undo2, Redo2, Save, XCircle, Eye,
  CheckCircle2, AlertTriangle, Settings,
} from 'lucide-react';
import type { ConfigValidationResult } from './validateConfig';

// ─── Types ──────────────────────────────────────────────

interface EditToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  changeCount: number;
  validation: ConfigValidationResult;
  saving: boolean;
  onAddList: () => void;
  onAddEdge: () => void;
  onConfigSettings: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onDiscard: () => void;
  onPreview: () => void;
}

// ─── Component ──────────────────────────────────────────

export function EditToolbar({
  canUndo,
  canRedo,
  changeCount,
  validation,
  saving,
  onAddList,
  onAddEdge,
  onConfigSettings,
  onUndo,
  onRedo,
  onSave,
  onDiscard,
  onPreview,
}: EditToolbarProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-zinc-900/95 px-3 py-2 shadow-lg backdrop-blur">
      {/* Add buttons */}
      <ToolButton icon={Plus} label="List" onClick={onAddList} color="blue" />
      <ToolButton icon={GitBranch} label="Edge" onClick={onAddEdge} color="blue" />
      <ToolButton icon={Settings} label="Config" onClick={onConfigSettings} />

      <Divider />

      {/* Undo/Redo */}
      <ToolButton icon={Undo2} onClick={onUndo} disabled={!canUndo} />
      <ToolButton icon={Redo2} onClick={onRedo} disabled={!canRedo} />

      {/* Dirty indicator */}
      {changeCount > 0 && (
        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-semibold text-amber-400">
          {changeCount} change{changeCount !== 1 ? 's' : ''}
        </span>
      )}

      <Divider />

      {/* Validation status */}
      {validation.valid ? (
        <span className="flex items-center gap-1 text-[10px] text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Valid
        </span>
      ) : (
        <span className="group relative flex items-center gap-1 text-[10px] text-red-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          {validation.errors.length} error{validation.errors.length !== 1 ? 's' : ''}
          {/* Tooltip with error list */}
          <div className="absolute bottom-full left-0 z-50 mb-2 hidden w-64 rounded border border-red-500/30 bg-zinc-900 p-2 shadow-xl group-hover:block">
            {validation.errors.map((e) => (
              <p key={e} className="text-[10px] text-red-400">{e}</p>
            ))}
          </div>
        </span>
      )}

      <Divider />

      {/* Preview / Save / Discard */}
      <ToolButton icon={Eye} label="Preview" onClick={onPreview} />
      <button
        onClick={onSave}
        disabled={!validation.valid || changeCount === 0 || saving}
        className="flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
      >
        <Save className="h-3 w-3" />
        {saving ? 'Saving...' : 'Save'}
      </button>
      <button
        onClick={onDiscard}
        className="flex items-center gap-1.5 rounded bg-red-600/80 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-red-500"
      >
        <XCircle className="h-3 w-3" />
        Discard
      </button>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────

interface ToolButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  label?: string;
  onClick: () => void;
  disabled?: boolean;
  color?: 'blue' | 'default';
}

function ToolButton({ icon: Icon, label, onClick, disabled, color }: ToolButtonProps) {
  const isBlue = color === 'blue';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 rounded px-2 py-1.5 text-[10px] font-medium transition-colors disabled:opacity-30"
      style={{
        color: isBlue ? '#3b82f6' : '#a1a1aa',
        backgroundColor: 'transparent',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = isBlue ? '#3b82f615' : '#27272a'; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function Divider() {
  return <div className="h-4 w-px bg-zinc-800" />;
}
