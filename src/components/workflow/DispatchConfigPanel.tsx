import { Terminal, User, ServerOff, Zap, ClipboardCheck } from 'lucide-react';
import type { ConfirmLevel } from '../../../shared/workflow-config';

// ─── Types ──────────────────────────────────────────────

interface DispatchConfigPanelProps {
  dispatchOnly: boolean;
  humanOnly: boolean;
  skipServerTransition: boolean;
  confirmLevel: ConfirmLevel;
  hasCommand: boolean;
  onDispatchOnlyChange: (v: boolean) => void;
  onHumanOnlyChange: (v: boolean) => void;
  onSkipServerTransitionChange: (v: boolean) => void;
  onConfirmLevelChange: (v: ConfirmLevel) => void;
}

// ─── Component ──────────────────────────────────────────

export function DispatchConfigPanel({
  dispatchOnly,
  humanOnly,
  skipServerTransition,
  confirmLevel,
  hasCommand,
  onDispatchOnlyChange,
  onHumanOnlyChange,
  onSkipServerTransitionChange,
  onConfirmLevelChange,
}: DispatchConfigPanelProps) {
  return (
    <div className="space-y-3">
      {/* Dispatch toggles */}
      <div className="space-y-2">
        <DispatchToggle
          icon={Terminal}
          label="Dispatch Only"
          description="This transition can only be triggered by a skill command, not by manual drag-and-drop"
          checked={dispatchOnly}
          onChange={onDispatchOnlyChange}
        />
        {dispatchOnly && !hasCommand && (
          <p className="ml-6 text-[9px] text-amber-400">
            No command configured — add one below for this toggle to be effective
          </p>
        )}

        <DispatchToggle
          icon={User}
          label="Human Only"
          description="This transition requires human confirmation and cannot be triggered by automated processes"
          checked={humanOnly}
          onChange={onHumanOnlyChange}
          badge={humanOnly ? 'HUMAN' : undefined}
          badgeColor="#6366f1"
        />

        <DispatchToggle
          icon={ServerOff}
          label="Skip Server Transition"
          description="The skill command handles the status change itself — the server won't move the scope"
          checked={skipServerTransition}
          onChange={onSkipServerTransitionChange}
        />
        {skipServerTransition && (
          <p className="ml-6 text-[9px] text-amber-400">
            The bound skill must handle the scope move itself
          </p>
        )}
      </div>

      {/* Confirm Level */}
      <div>
        <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Confirmation Mode
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          <ConfirmLevelCard
            icon={Zap}
            label="Quick"
            description="Immediate — one click to confirm"
            active={confirmLevel === 'quick'}
            onClick={() => onConfirmLevelChange('quick')}
            color="#f59e0b"
          />
          <ConfirmLevelCard
            icon={ClipboardCheck}
            label="Full"
            description="Review — must acknowledge checklist"
            active={confirmLevel === 'full'}
            onClick={() => onConfirmLevelChange('full')}
            color="#8b5cf6"
          />
        </div>
        {confirmLevel === 'full' && (
          <p className="mt-1.5 text-[9px] text-violet-400">
            Users must review the checklist before confirming this transition
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────

function DispatchToggle({ icon: Icon, label, description, checked, onChange, badge, badgeColor }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  badge?: string;
  badgeColor?: string;
}) {
  return (
    <label className="flex cursor-pointer gap-2 rounded-md border border-zinc-800 bg-zinc-950/30 px-2.5 py-2 transition-colors hover:border-zinc-700">
      <div
        className="relative mt-0.5 h-4 w-7 shrink-0 rounded-full transition-colors"
        style={{ backgroundColor: checked ? '#22c55e' : '#3f3f46' }}
      >
        <div
          className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform"
          style={{ transform: checked ? 'translateX(12px)' : 'translateX(2px)' }}
        />
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3 w-3 text-zinc-400" />
          <span className="text-[11px] font-medium text-zinc-300">{label}</span>
          {badge && (
            <span
              className="rounded px-1 py-0.5 text-[8px] font-bold"
              style={{ backgroundColor: `${badgeColor}20`, color: badgeColor }}
            >
              {badge}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[9px] text-zinc-600 leading-relaxed">{description}</p>
      </div>
    </label>
  );
}

function ConfirmLevelCard({ icon: Icon, label, description, active, onClick, color }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-md px-2.5 py-2 text-left transition-all"
      style={{
        backgroundColor: active ? `${color}12` : 'transparent',
        border: `1px solid ${active ? `${color}60` : '#27272a'}`,
      }}
    >
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" style={{ color: active ? color : '#52525b' }} />
        <span className="text-[10px] font-semibold" style={{ color: active ? color : '#a1a1aa' }}>
          {label}
        </span>
      </div>
      <p className="mt-0.5 text-[8px]" style={{ color: active ? '#a1a1aa' : '#52525b' }}>
        {description}
      </p>
    </button>
  );
}
