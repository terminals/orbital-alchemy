import { useState } from 'react';
import { Plus, X } from 'lucide-react';

export const STEPPER_BTN = "flex h-7 w-7 items-center justify-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-muted-foreground transition-colors hover:border-[rgba(0,188,212,0.3)] hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed";
export const RESET_BTN = "flex items-center gap-1.5 rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-[rgba(0,188,212,0.3)] hover:text-foreground disabled:opacity-40";
const TEXT_INPUT = "h-8 w-full rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-2.5 text-sm text-foreground outline-none transition-colors hover:border-[rgba(0,188,212,0.3)] focus:border-[rgba(0,188,212,0.5)] focus:shadow-[0_0_8px_rgba(0,188,212,0.15)] placeholder:text-muted-foreground/40";

export function SegmentedControl({
  value,
  onChange,
  options,
  disabled,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-0.5">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          disabled={disabled}
          aria-pressed={value === opt.value}
          className={`px-2.5 py-1 text-xs rounded-[3px] transition-all duration-150 ${
            value === opt.value
              ? 'bg-[rgba(0,188,212,0.2)] text-[rgb(0,188,212)] shadow-[0_0_8px_rgba(0,188,212,0.15)]'
              : 'text-muted-foreground hover:text-foreground'
          } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
      <div className="min-w-0">
        <div className="text-sm text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground/60">{description}</div>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

export function ToolListSetting({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const [input, setInput] = useState('');

  const addTool = () => {
    const tool = input.trim();
    if (tool && !value.includes(tool)) {
      onChange([...value, tool]);
      setInput('');
    }
  };

  return (
    <div>
      <div className="mb-2">
        <div className="text-sm text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground/60">{description}</div>
      </div>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTool(); } }}
          disabled={disabled}
          placeholder="Tool name (e.g. Read, Bash)"
          aria-label={`Add ${label.toLowerCase()}`}
          className={TEXT_INPUT}
        />
        <button
          onClick={addTool}
          disabled={disabled || !input.trim()}
          aria-label={`Add tool to ${label.toLowerCase()}`}
          className={STEPPER_BTN + ' !w-8 !h-8'}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map(tool => (
            <span
              key={tool}
              className="inline-flex items-center gap-1 rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-2 py-0.5 text-xs text-muted-foreground"
            >
              {tool}
              <button
                onClick={() => onChange(value.filter(t => t !== tool))}
                disabled={disabled}
                aria-label={`Remove ${tool}`}
                className="text-muted-foreground/60 hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function EnvVarsEditor({
  value,
  onChange,
  disabled,
}: {
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  disabled?: boolean;
}) {
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const entries = Object.entries(value);

  const addVar = () => {
    const key = newKey.trim();
    if (key) {
      onChange({ ...value, [key]: newVal });
      setNewKey('');
      setNewVal('');
    }
  };

  return (
    <div>
      <div className="mb-2">
        <div className="text-sm text-foreground">Environment Variables</div>
        <div className="text-xs text-muted-foreground/60">Custom env vars passed to every dispatched session</div>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 mb-2">
        <input
          type="text"
          value={newKey}
          onChange={e => setNewKey(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVar(); } }}
          disabled={disabled}
          placeholder="KEY"
          aria-label="Environment variable name"
          className={TEXT_INPUT + ' sm:w-1/3'}
        />
        <div className="flex gap-2 flex-1">
        <input
          type="text"
          value={newVal}
          onChange={e => setNewVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVar(); } }}
          disabled={disabled}
          placeholder="value"
          aria-label="Environment variable value"
          className={TEXT_INPUT + ' flex-1'}
        />
        <button
          onClick={addVar}
          disabled={disabled || !newKey.trim()}
          aria-label="Add environment variable"
          className={STEPPER_BTN + ' !w-8 !h-8'}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        </div>
      </div>
      {entries.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {entries.map(([k, v]) => (
            <div
              key={k}
              className="flex items-center gap-2 rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1"
            >
              <span className="text-xs font-medium text-foreground">{k}</span>
              <span className="text-xs text-muted-foreground/60">=</span>
              <span className="text-xs text-muted-foreground flex-1 truncate">{v}</span>
              <button
                onClick={() => {
                  const next = { ...value };
                  delete next[k];
                  onChange(next);
                }}
                disabled={disabled}
                aria-label={`Remove ${k}`}
                className="text-muted-foreground/60 hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
