import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { useSettings, FONT_CATALOG, preloadFontPreviews, type FontCategory } from '@/hooks/useSettings';
import { useDispatchFlags } from '@/hooks/useDispatchFlags';
import { useDispatchSettings } from '@/hooks/useDispatchSettings';
import { ConfigurationTile } from '@/components/ConfigurationTile';
import { ProjectsPanel } from '@/components/config/ProjectsPanel';
import { useOnboarding } from '@/components/onboarding/OnboardingProvider';

const CATEGORY_LABELS: Record<FontCategory, string> = {
  'monospace': 'Monospace',
  'sans-serif': 'Sans-Serif',
  'display': 'Display',
};

const CATEGORY_ORDER: FontCategory[] = ['monospace', 'sans-serif', 'display'];

const STEPPER_BTN = "flex h-7 w-7 items-center justify-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-muted-foreground transition-colors hover:border-[rgba(0,188,212,0.3)] hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed";
const RESET_BTN = "flex items-center gap-1.5 rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-[rgba(0,188,212,0.3)] hover:text-foreground disabled:opacity-40";
const TEXT_INPUT = "h-8 w-full rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-2.5 text-sm text-foreground outline-none transition-colors hover:border-[rgba(0,188,212,0.3)] focus:border-[rgba(0,188,212,0.5)] focus:shadow-[0_0_8px_rgba(0,188,212,0.15)] placeholder:text-muted-foreground/40";

export function Settings() {
  const { settings, updateSetting } = useSettings();
  const { restart: restartTour } = useOnboarding();
  const { flags, loading: loadingFlags, saving: savingFlags, error: flagsError, updateFlags, resetToDefaults: resetFlags } = useDispatchFlags();
  const { settings: dispatchSettings, loading: loadingSettings, saving: savingSettings, error: settingsError, updateSettings, resetToDefaults: resetSettings } = useDispatchSettings();

  useEffect(() => { preloadFontPreviews(); }, []);

  const decrementScale = () => {
    const next = Math.max(0.8, Math.round((settings.fontScale - 0.05) * 100) / 100);
    updateSetting('fontScale', next);
  };

  const incrementScale = () => {
    const next = Math.min(1.3, Math.round((settings.fontScale + 0.05) * 100) / 100);
    updateSetting('fontScale', next);
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <SettingsIcon className="h-4 w-4 text-primary" />
        <h1 className="text-xl font-light">Settings</h1>
      </div>

      <ScrollArea className="flex-1">
        <div className="columns-1 lg:columns-2 gap-4 sm:gap-6 pr-1 sm:pr-4 pb-8 [&>*]:mb-4 sm:[&>*]:mb-6 [&>*]:break-inside-avoid">

          {/* ── Configuration (full width) ── */}
          <div className="lg:[column-span:all]">
            <ConfigurationTile />
          </div>

          {/* ── Projects (full width) ── */}
          <div className="lg:[column-span:all]">
            <ProjectsPanel />
          </div>

          {/* ── Dispatch: CLI Flags ── */}
          <section className={`card-glass settings-panel rounded-xl p-5 ${loadingFlags ? 'opacity-60' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-medium uppercase tracking-wider text-primary">
                  Dispatch
                </h2>
                {flagsError && <span className="text-[11px] text-destructive">{flagsError}</span>}
              </div>
              <button onClick={resetFlags} disabled={savingFlags || loadingFlags} className={RESET_BTN}>
                <RotateCcw className="h-3 w-3" />
                Reset to defaults
              </button>
            </div>

            <SettingRow label="Permission Mode" description="How permission prompts are handled in dispatched sessions">
              <SegmentedControl
                label="Permission Mode"
                value={flags.permissionMode}
                onChange={v => updateFlags({ permissionMode: v as typeof flags.permissionMode })}
                options={[
                  { value: 'bypass', label: 'Bypass' },
                  { value: 'default', label: 'Default' },
                  { value: 'plan', label: 'Plan' },
                  { value: 'acceptEdits', label: 'Accept Edits' },
                ]}
                disabled={savingFlags}
              />
            </SettingRow>

            <Separator className="my-4" />

            <SettingRow label="Model" description="Override the Claude model for dispatched sessions">
              <SegmentedControl
                label="Model"
                value={flags.model}
                onChange={v => updateFlags({ model: v })}
                options={[
                  { value: '', label: 'Inherit' },
                  { value: 'sonnet', label: 'Sonnet' },
                  { value: 'opus', label: 'Opus' },
                  { value: 'haiku', label: 'Haiku' },
                ]}
                disabled={savingFlags}
              />
            </SettingRow>

            <Separator className="my-4" />

            <SettingRow label="Reasoning Effort" description="How much thinking the model does per response">
              <SegmentedControl
                label="Reasoning Effort"
                value={flags.reasoningEffort}
                onChange={v => updateFlags({ reasoningEffort: v as typeof flags.reasoningEffort })}
                options={[
                  { value: '', label: 'Default' },
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                ]}
                disabled={savingFlags}
              />
            </SettingRow>

            <Separator className="my-4" />

            <SettingRow label="Max Turns" description="Maximum conversation turns, 0 = unlimited">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateFlags({ maxTurns: Math.max(0, flags.maxTurns - 1) })}
                  disabled={savingFlags || flags.maxTurns <= 0}
                  className={STEPPER_BTN}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-12 text-center text-sm tabular-nums">
                  {flags.maxTurns === 0 ? '\u221E' : flags.maxTurns}
                </span>
                <button
                  onClick={() => updateFlags({ maxTurns: flags.maxTurns + 1 })}
                  disabled={savingFlags}
                  className={STEPPER_BTN}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </SettingRow>

            <Separator className="my-4" />

            <SettingRow label="Verbose Logging" description="Enable verbose CLI output in dispatched sessions">
              <ToggleSwitch
                checked={flags.verbose}
                onCheckedChange={v => updateFlags({ verbose: v })}
                disabled={savingFlags}
              />
            </SettingRow>

            <Separator className="my-4" />

            <SettingRow label="No Markdown" description="Disable markdown rendering in terminal output">
              <ToggleSwitch
                checked={flags.noMarkdown}
                onCheckedChange={v => updateFlags({ noMarkdown: v })}
                disabled={savingFlags}
              />
            </SettingRow>

            <Separator className="my-4" />

            <SettingRow label="Print Mode" description="Force non-interactive mode for single dispatches">
              <ToggleSwitch
                checked={flags.printMode}
                onCheckedChange={v => updateFlags({ printMode: v })}
                disabled={savingFlags}
              />
            </SettingRow>

            <Separator className="my-4" />

            <SettingRow label="Output Format" description="Output format for non-interactive mode">
              <SegmentedControl
                label="Output Format"
                value={flags.outputFormat}
                onChange={v => updateFlags({ outputFormat: v as typeof flags.outputFormat })}
                options={[
                  { value: '', label: 'Default' },
                  { value: 'text', label: 'Text' },
                  { value: 'json', label: 'JSON' },
                  { value: 'stream-json', label: 'Stream' },
                ]}
                disabled={savingFlags}
              />
            </SettingRow>

            <Separator className="my-4" />

            <ToolListSetting
              label="Allowed Tools"
              description="Whitelist specific tools (leave empty for all)"
              value={flags.allowedTools}
              onChange={v => updateFlags({ allowedTools: v })}
              disabled={savingFlags}
            />

            <Separator className="my-4" />

            <ToolListSetting
              label="Disallowed Tools"
              description="Block specific tools from being used"
              value={flags.disallowedTools}
              onChange={v => updateFlags({ disallowedTools: v })}
              disabled={savingFlags}
            />

            <Separator className="my-4" />

            <div>
              <div className="mb-2">
                <div className="text-sm text-foreground">System Prompt</div>
                <div className="text-xs text-muted-foreground/60">Custom instructions appended to every dispatched session</div>
              </div>
              <textarea
                value={flags.appendSystemPrompt}
                onChange={e => updateFlags({ appendSystemPrompt: e.target.value })}
                disabled={savingFlags}
                rows={3}
                placeholder="Enter additional instructions..."
                className="w-full rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-2.5 py-2 text-sm text-foreground outline-none transition-colors hover:border-[rgba(0,188,212,0.3)] focus:border-[rgba(0,188,212,0.5)] focus:shadow-[0_0_8px_rgba(0,188,212,0.15)] placeholder:text-muted-foreground/40 resize-y"
              />
            </div>
          </section>

          {/* ── Dispatch: Operations ── */}
          <section className={`card-glass settings-panel rounded-xl p-5 ${loadingSettings ? 'opacity-60' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-medium uppercase tracking-wider text-primary">
                  Dispatch: Operations
                </h2>
                {settingsError && <span className="text-[11px] text-destructive">{settingsError}</span>}
              </div>
              <button onClick={resetSettings} disabled={savingSettings || loadingSettings} className={RESET_BTN}>
                <RotateCcw className="h-3 w-3" />
                Reset to defaults
              </button>
            </div>

            <SettingRow label="Terminal Adapter" description="How dispatch windows are opened">
              <SegmentedControl
                label="Terminal Adapter"
                value={dispatchSettings.terminalAdapter}
                onChange={v => updateSettings({ terminalAdapter: v })}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'iterm2', label: 'iTerm2' },
                  { value: 'subprocess', label: 'Subprocess' },
                  { value: 'none', label: 'None' },
                ]}
                disabled={savingSettings}
              />
            </SettingRow>

            <Separator className="my-4" />

            <SettingRow label="Stale Timeout" description="Minutes before unlinked dispatch is marked abandoned">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateSettings({ staleTimeoutMinutes: Math.max(1, dispatchSettings.staleTimeoutMinutes - 1) })}
                  disabled={savingSettings || dispatchSettings.staleTimeoutMinutes <= 1}
                  className={STEPPER_BTN}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-12 text-center text-sm tabular-nums">
                  {dispatchSettings.staleTimeoutMinutes}m
                </span>
                <button
                  onClick={() => updateSettings({ staleTimeoutMinutes: dispatchSettings.staleTimeoutMinutes + 1 })}
                  disabled={savingSettings}
                  className={STEPPER_BTN}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </SettingRow>

            <Separator className="my-4" />

            <SettingRow label="Max Batch Size" description="Maximum scopes per batch dispatch">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateSettings({ maxBatchSize: Math.max(1, dispatchSettings.maxBatchSize - 1) })}
                  disabled={savingSettings || dispatchSettings.maxBatchSize <= 1}
                  className={STEPPER_BTN}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-12 text-center text-sm tabular-nums">
                  {dispatchSettings.maxBatchSize}
                </span>
                <button
                  onClick={() => updateSettings({ maxBatchSize: dispatchSettings.maxBatchSize + 1 })}
                  disabled={savingSettings}
                  className={STEPPER_BTN}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </SettingRow>

            <Separator className="my-4" />

            <SettingRow label="Max Concurrent" description="Limit simultaneous dispatches, 0 = unlimited">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateSettings({ maxConcurrent: Math.max(0, dispatchSettings.maxConcurrent - 1) })}
                  disabled={savingSettings || dispatchSettings.maxConcurrent <= 0}
                  className={STEPPER_BTN}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-12 text-center text-sm tabular-nums">
                  {dispatchSettings.maxConcurrent === 0 ? '\u221E' : dispatchSettings.maxConcurrent}
                </span>
                <button
                  onClick={() => updateSettings({ maxConcurrent: dispatchSettings.maxConcurrent + 1 })}
                  disabled={savingSettings}
                  className={STEPPER_BTN}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </SettingRow>

            <Separator className="my-4" />

            <EnvVarsEditor
              value={dispatchSettings.envVars}
              onChange={envVars => updateSettings({ envVars })}
              disabled={savingSettings}
            />
          </section>

          {/* ── Appearance ── */}
          <section className="card-glass settings-panel rounded-xl p-5">
            <h2 className="text-sm font-medium uppercase tracking-wider text-primary mb-5">
              Appearance
            </h2>

            {/* Font Family */}
            <SettingRow label="Font Family" description="Typeface used across the dashboard">
              <select
                value={settings.fontFamily}
                onChange={e => updateSetting('fontFamily', e.target.value)}
                style={{
                  fontFamily: `'${settings.fontFamily}', ${FONT_CATALOG.find(f => f.family === settings.fontFamily)?.category === 'monospace' ? 'monospace' : 'sans-serif'}`,
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 8px center',
                }}
                className="h-8 rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-2.5 pr-7 text-sm text-foreground outline-none transition-colors hover:border-[rgba(0,188,212,0.3)] focus:border-[rgba(0,188,212,0.5)] focus:shadow-[0_0_8px_rgba(0,188,212,0.15)] appearance-none cursor-pointer"
              >
                {CATEGORY_ORDER.map(category => (
                  <optgroup key={category} label={CATEGORY_LABELS[category]}>
                    {FONT_CATALOG.filter(f => f.category === category).map(font => (
                      <option key={font.family} value={font.family}>
                        {font.label}{font.family === 'Space Grotesk' ? ' (default)' : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </SettingRow>

            <Separator className="my-4" />

            {/* Font Size Scale */}
            <SettingRow label="Font Size" description="Scale text across the dashboard">
              <div className="flex items-center gap-2">
                <button
                  onClick={decrementScale}
                  disabled={settings.fontScale <= 0.8}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-muted-foreground transition-colors hover:border-[rgba(0,188,212,0.3)] hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-12 text-center text-sm tabular-nums">
                  {Math.round(settings.fontScale * 100)}%
                </span>
                <button
                  onClick={incrementScale}
                  disabled={settings.fontScale >= 1.3}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-muted-foreground transition-colors hover:border-[rgba(0,188,212,0.3)] hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </SettingRow>

            <Separator className="my-4" />

            {/* Reduce Motion */}
            <SettingRow label="Reduce Motion" description="Disable animations and transitions">
              <ToggleSwitch
                checked={settings.reduceMotion}
                onCheckedChange={v => updateSetting('reduceMotion', v)}
              />
            </SettingRow>

            <Separator className="my-4" />

            {/* Background Effects */}
            <SettingRow label="Background Effects" description="Animated orbs and grid overlay">
              <ToggleSwitch
                checked={settings.showBackgroundEffects}
                onCheckedChange={v => updateSetting('showBackgroundEffects', v)}
              />
            </SettingRow>
          </section>

          {/* ── Display ── */}
          <section className="card-glass settings-panel rounded-xl p-5">
            <h2 className="text-sm font-medium uppercase tracking-wider text-primary mb-5">
              Display
            </h2>

            <SettingRow label="Status Bar" description="Scope progress bar at bottom">
              <ToggleSwitch
                checked={settings.showStatusBar}
                onCheckedChange={v => updateSetting('showStatusBar', v)}
              />
            </SettingRow>

            <Separator className="my-4" />

            <SettingRow label="Compact Mode" description="Reduce spacing for denser layout">
              <ToggleSwitch
                checked={settings.compactMode}
                onCheckedChange={v => updateSetting('compactMode', v)}
              />
            </SettingRow>
          </section>

          {/* ── Onboarding ── */}
          <section className="card-glass settings-panel rounded-xl p-5">
            <h2 className="text-sm font-medium uppercase tracking-wider text-primary mb-5">
              Onboarding
            </h2>

            <SettingRow label="Guided Tour" description="Interactive walkthrough of all pages">
              <button
                onClick={restartTour}
                className="flex items-center gap-1.5 rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-[rgba(0,188,212,0.3)] hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" />
                Restart tour
              </button>
            </SettingRow>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}

function SegmentedControl({
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

function SettingRow({
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

function ToolListSetting({
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

function EnvVarsEditor({
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
