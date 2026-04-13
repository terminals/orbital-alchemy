import { RotateCcw } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { useDispatchFlags } from '@/hooks/useDispatchFlags';
import {
  SegmentedControl,
  SettingRow,
  ToolListSetting,
  RESET_BTN,
} from './SettingsPrimitives';

export function DispatchFlagsPanel() {
  const { flags, loading, saving, error, updateFlags, resetToDefaults } = useDispatchFlags();

  return (
    <section className={`card-glass settings-panel rounded-xl p-5 ${loading ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-primary">
            Dispatch
          </h2>
          {error && <span className="text-[11px] text-destructive">{error}</span>}
        </div>
        <button onClick={resetToDefaults} disabled={saving || loading} className={RESET_BTN}>
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
          disabled={saving}
        />
      </SettingRow>

      <Separator className="my-4" />

      <SettingRow label="Verbose Logging" description="Enable verbose CLI output in dispatched sessions">
        <ToggleSwitch
          checked={flags.verbose}
          onCheckedChange={v => updateFlags({ verbose: v })}
          disabled={saving}
        />
      </SettingRow>

      <Separator className="my-4" />

      <SettingRow label="No Markdown" description="Disable markdown rendering in terminal output">
        <ToggleSwitch
          checked={flags.noMarkdown}
          onCheckedChange={v => updateFlags({ noMarkdown: v })}
          disabled={saving}
        />
      </SettingRow>

      <Separator className="my-4" />

      <SettingRow label="Print Mode" description="Force non-interactive mode for single dispatches">
        <ToggleSwitch
          checked={flags.printMode}
          onCheckedChange={v => updateFlags({ printMode: v })}
          disabled={saving}
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
          disabled={saving}
        />
      </SettingRow>

      <Separator className="my-4" />

      <ToolListSetting
        label="Allowed Tools"
        description="Whitelist specific tools (leave empty for all)"
        value={flags.allowedTools}
        onChange={v => updateFlags({ allowedTools: v })}
        disabled={saving}
      />

      <Separator className="my-4" />

      <ToolListSetting
        label="Disallowed Tools"
        description="Block specific tools from being used"
        value={flags.disallowedTools}
        onChange={v => updateFlags({ disallowedTools: v })}
        disabled={saving}
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
          disabled={saving}
          rows={3}
          placeholder="Enter additional instructions..."
          className="w-full rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-2.5 py-2 text-sm text-foreground outline-none transition-colors hover:border-[rgba(0,188,212,0.3)] focus:border-[rgba(0,188,212,0.5)] focus:shadow-[0_0_8px_rgba(0,188,212,0.15)] placeholder:text-muted-foreground/40 resize-y"
        />
      </div>
    </section>
  );
}
