import { Separator } from '@/components/ui/separator';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { useSettings } from '@/hooks/useSettings';
import { SettingRow } from './SettingsPrimitives';

export function DisplayPanel() {
  const { settings, updateSetting } = useSettings();

  return (
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
  );
}
