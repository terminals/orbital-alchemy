import { Minus, Plus } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { useSettings, FONT_CATALOG, type FontCategory } from '@/hooks/useSettings';
import { SettingRow } from './SettingsPrimitives';

const CATEGORY_LABELS: Record<FontCategory, string> = {
  'monospace': 'Monospace',
  'sans-serif': 'Sans-Serif',
  'display': 'Display',
};

const CATEGORY_ORDER: FontCategory[] = ['monospace', 'sans-serif', 'display'];

export function AppearancePanel() {
  const { settings, updateSetting } = useSettings();

  const decrementScale = () => {
    const next = Math.max(0.8, Math.round((settings.fontScale - 0.05) * 100) / 100);
    updateSetting('fontScale', next);
  };

  const incrementScale = () => {
    const next = Math.min(1.3, Math.round((settings.fontScale + 0.05) * 100) / 100);
    updateSetting('fontScale', next);
  };

  return (
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
  );
}
