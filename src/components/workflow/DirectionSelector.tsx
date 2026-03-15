import { ArrowRight, ArrowLeft, CornerRightDown } from 'lucide-react';
import type { EdgeDirection } from '../../../shared/workflow-config';

// ─── Types ──────────────────────────────────────────────

interface DirectionSelectorProps {
  value: EdgeDirection;
  onChange: (direction: EdgeDirection) => void;
  fromLabel: string;
  toLabel: string;
}

interface DirectionOption {
  value: EdgeDirection;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  arrowColor: string;
  bgActive: string;
  borderActive: string;
  hint: string;
}

// ─── Direction Options ──────────────────────────────────

const DIRECTION_OPTIONS: DirectionOption[] = [
  {
    value: 'forward',
    label: 'Forward',
    description: 'Normal progression through the workflow',
    icon: ArrowRight,
    arrowColor: '#22c55e',
    bgActive: 'rgba(34,197,94,0.12)',
    borderActive: 'rgba(34,197,94,0.4)',
    hint: '',
  },
  {
    value: 'backward',
    label: 'Backward',
    description: 'Return to a previous stage for rework',
    icon: ArrowLeft,
    arrowColor: '#f59e0b',
    bgActive: 'rgba(245,158,11,0.12)',
    borderActive: 'rgba(245,158,11,0.4)',
    hint: 'Backward edges are shown as amber dashed lines',
  },
  {
    value: 'shortcut',
    label: 'Shortcut',
    description: 'Skip intermediate stages',
    icon: CornerRightDown,
    arrowColor: '#6366f1',
    bgActive: 'rgba(99,102,241,0.12)',
    borderActive: 'rgba(99,102,241,0.4)',
    hint: 'Shortcut edges are shown as dashed lines and may require a checklist confirmation',
  },
];

// ─── Component ──────────────────────────────────────────

export function DirectionSelector({ value, onChange, fromLabel, toLabel }: DirectionSelectorProps) {
  const selected = DIRECTION_OPTIONS.find((d) => d.value === value) ?? DIRECTION_OPTIONS[0];

  return (
    <div className="space-y-2">
      {/* Direction cards */}
      <div className="space-y-1.5">
        {DIRECTION_OPTIONS.map((opt) => {
          const isSelected = value === opt.value;
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-all"
              style={{
                backgroundColor: isSelected ? opt.bgActive : 'transparent',
                border: `1px solid ${isSelected ? opt.borderActive : '#27272a'}`,
              }}
            >
              <Icon
                className="h-4 w-4 shrink-0"
                style={{ color: isSelected ? opt.arrowColor : '#52525b' }}
              />
              <div className="flex-1 min-w-0">
                <div
                  className="text-[11px] font-semibold"
                  style={{ color: isSelected ? opt.arrowColor : '#a1a1aa' }}
                >
                  {opt.label}
                </div>
                <div className="text-[9px] text-zinc-500 truncate">{opt.description}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Visual preview: mini diagram */}
      <div className="flex items-center justify-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2">
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-medium text-zinc-300">
          {fromLabel}
        </span>
        <svg width="48" height="16" viewBox="0 0 48 16" className="shrink-0">
          {value === 'backward' ? (
            <>
              <line x1="40" y1="8" x2="8" y2="8" stroke={selected.arrowColor} strokeWidth="1.5" strokeDasharray="3 2" />
              <polygon points="8,8 14,4 14,12" fill={selected.arrowColor} />
            </>
          ) : (
            <>
              <line
                x1="8" y1="8" x2="40" y2="8"
                stroke={selected.arrowColor}
                strokeWidth="1.5"
                strokeDasharray={value === 'shortcut' ? '3 2' : 'none'}
              />
              <polygon points="40,8 34,4 34,12" fill={selected.arrowColor} />
            </>
          )}
        </svg>
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-medium text-zinc-300">
          {toLabel}
        </span>
      </div>

      {/* Change hint */}
      {selected.hint && (
        <p className="text-[9px] text-zinc-600 leading-relaxed">{selected.hint}</p>
      )}
    </div>
  );
}
