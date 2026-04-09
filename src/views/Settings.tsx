import { useEffect } from 'react';
import { Settings as SettingsIcon, Minus, Plus, RotateCcw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { useSettings, FONT_CATALOG, preloadFontPreviews, type FontCategory } from '@/hooks/useSettings';
import { ConfigurationTile } from '@/components/ConfigurationTile';
import { useOnboarding } from '@/components/onboarding/OnboardingProvider';

const CATEGORY_LABELS: Record<FontCategory, string> = {
  'monospace': 'Monospace',
  'sans-serif': 'Sans-Serif',
  'display': 'Display',
};

const CATEGORY_ORDER: FontCategory[] = ['monospace', 'sans-serif', 'display'];

export function Settings() {
  const { settings, updateSetting } = useSettings();
  const { restart: restartTour } = useOnboarding();

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
        <div className="flex flex-col gap-6 pr-4 pb-8">

          {/* ── Configuration ── */}
          <ConfigurationTile />

          {/* ── Appearance ── */}
          <section className="card-glass rounded-xl p-5">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-5">
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
          <section className="card-glass rounded-xl p-5">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-5">
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
          <section className="card-glass rounded-xl p-5">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-5">
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
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground/60">{description}</div>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}
