import { useEffect } from 'react';
import { Settings as SettingsIcon, Minus, Plus } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { useSettings, FONT_CATALOG, preloadFontPreviews, type FontCategory } from '@/hooks/useSettings';
import { cn } from '@/lib/utils';

const CATEGORY_LABELS: Record<FontCategory, string> = {
  'monospace': 'Monospace',
  'sans-serif': 'Sans-Serif',
  'display': 'Display',
};

const CATEGORY_ORDER: FontCategory[] = ['monospace', 'sans-serif', 'display'];

export function Settings() {
  const { settings, updateSetting } = useSettings();

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
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-2 pb-4">
        <SettingsIcon className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-medium tracking-wide">Settings</h1>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 pr-4 pb-8">

          {/* ── Appearance ── */}
          <section className="card-glass rounded-xl p-5">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-5">
              Appearance
            </h2>

            {/* Font Family */}
            <div className="mb-5">
              <label className="text-xs text-muted-foreground mb-3 block">Font Family</label>
              {CATEGORY_ORDER.map(category => {
                const fonts = FONT_CATALOG.filter(f => f.category === category);
                return (
                  <div key={category} className="mb-4 last:mb-0">
                    <span className="text-xxs uppercase tracking-widest text-muted-foreground/60 mb-2 block">
                      {CATEGORY_LABELS[category]}
                    </span>
                    <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                      {fonts.map(font => (
                        <button
                          key={font.family}
                          onClick={() => updateSetting('fontFamily', font.family)}
                          className={cn(
                            'group relative flex flex-col items-start rounded-lg border px-3 py-2.5 text-left transition-all duration-200',
                            settings.fontFamily === font.family
                              ? 'border-[rgba(0,188,212,0.5)] bg-[rgba(0,188,212,0.08)] shadow-[0_0_12px_rgba(0,188,212,0.15)]'
                              : 'border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.04)]'
                          )}
                        >
                          <span
                            className="text-sm text-foreground truncate w-full"
                            style={{ fontFamily: `'${font.family}', ${category === 'monospace' ? 'monospace' : 'sans-serif'}` }}
                          >
                            {font.label}
                          </span>
                          <span
                            className="text-xs text-muted-foreground/50 mt-0.5"
                            style={{ fontFamily: `'${font.family}', ${category === 'monospace' ? 'monospace' : 'sans-serif'}` }}
                          >
                            Aa Bb 0123
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

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
