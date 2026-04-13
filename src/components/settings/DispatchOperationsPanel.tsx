import { Minus, Plus, RotateCcw } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useDispatchSettings } from '@/hooks/useDispatchSettings';
import {
  SegmentedControl,
  SettingRow,
  EnvVarsEditor,
  STEPPER_BTN,
  RESET_BTN,
} from './SettingsPrimitives';

export function DispatchOperationsPanel() {
  const { settings, loading, saving, error, updateSettings, resetToDefaults } = useDispatchSettings();

  return (
    <section className={`card-glass settings-panel rounded-xl p-5 ${loading ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-primary">
            Dispatch: Operations
          </h2>
          {error && <span className="text-[11px] text-destructive">{error}</span>}
        </div>
        <button onClick={resetToDefaults} disabled={saving || loading} className={RESET_BTN}>
          <RotateCcw className="h-3 w-3" />
          Reset to defaults
        </button>
      </div>

      <SettingRow label="Terminal Adapter" description="How dispatch windows are opened">
        <SegmentedControl
          label="Terminal Adapter"
          value={settings.terminalAdapter}
          onChange={v => updateSettings({ terminalAdapter: v })}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'iterm2', label: 'iTerm2' },
            { value: 'subprocess', label: 'Subprocess' },
            { value: 'none', label: 'None' },
          ]}
          disabled={saving}
        />
      </SettingRow>

      <Separator className="my-4" />

      <SettingRow label="Stale Timeout" description="Minutes before unlinked dispatch is marked abandoned">
        <div className="flex items-center gap-2">
          <button
            onClick={() => updateSettings({ staleTimeoutMinutes: Math.max(1, settings.staleTimeoutMinutes - 1) })}
            disabled={saving || settings.staleTimeoutMinutes <= 1}
            className={STEPPER_BTN}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-12 text-center text-sm tabular-nums">
            {settings.staleTimeoutMinutes}m
          </span>
          <button
            onClick={() => updateSettings({ staleTimeoutMinutes: settings.staleTimeoutMinutes + 1 })}
            disabled={saving}
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
            onClick={() => updateSettings({ maxBatchSize: Math.max(1, settings.maxBatchSize - 1) })}
            disabled={saving || settings.maxBatchSize <= 1}
            className={STEPPER_BTN}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-12 text-center text-sm tabular-nums">
            {settings.maxBatchSize}
          </span>
          <button
            onClick={() => updateSettings({ maxBatchSize: settings.maxBatchSize + 1 })}
            disabled={saving}
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
            onClick={() => updateSettings({ maxConcurrent: Math.max(0, settings.maxConcurrent - 1) })}
            disabled={saving || settings.maxConcurrent <= 0}
            className={STEPPER_BTN}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-12 text-center text-sm tabular-nums">
            {settings.maxConcurrent === 0 ? '\u221E' : settings.maxConcurrent}
          </span>
          <button
            onClick={() => updateSettings({ maxConcurrent: settings.maxConcurrent + 1 })}
            disabled={saving}
            className={STEPPER_BTN}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </SettingRow>

      <Separator className="my-4" />

      <EnvVarsEditor
        value={settings.envVars}
        onChange={envVars => updateSettings({ envVars })}
        disabled={saving}
      />
    </section>
  );
}
