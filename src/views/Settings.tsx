import { useEffect } from 'react';
import { Settings as SettingsIcon, RotateCcw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { preloadFontPreviews } from '@/hooks/useSettings';
import { ConfigurationTile } from '@/components/ConfigurationTile';
import { ProjectsPanel } from '@/components/config/ProjectsPanel';
import { useOnboarding } from '@/components/onboarding/OnboardingProvider';
import { DispatchFlagsPanel } from '@/components/settings/DispatchFlagsPanel';
import { DispatchOperationsPanel } from '@/components/settings/DispatchOperationsPanel';
import { AppearancePanel } from '@/components/settings/AppearancePanel';
import { DisplayPanel } from '@/components/settings/DisplayPanel';
import { SettingRow } from '@/components/settings/SettingsPrimitives';

export function Settings() {
  const { restart: restartTour } = useOnboarding();

  useEffect(() => { preloadFontPreviews(); }, []);

  return (
    <div className="flex flex-1 min-h-0 flex-col -mt-4">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <SettingsIcon className="h-4 w-4 text-primary" />
        <h1 className="text-xl font-light">Settings</h1>
      </div>

      <ScrollArea className="flex-1">
        <div className="columns-1 lg:columns-2 gap-4 sm:gap-6 pr-1 sm:pr-4 pb-8 [&>*]:mb-4 sm:[&>*]:mb-6 [&>*]:break-inside-avoid">

          {/* Configuration (full width) */}
          <div className="lg:[column-span:all]">
            <ConfigurationTile />
          </div>

          {/* Projects (full width) */}
          <div className="lg:[column-span:all]">
            <ProjectsPanel />
          </div>

          {/* Dispatch: CLI Flags */}
          <DispatchFlagsPanel />

          {/* Dispatch: Operations */}
          <DispatchOperationsPanel />

          {/* Appearance */}
          <AppearancePanel />

          {/* Display */}
          <DisplayPanel />

          {/* Onboarding */}
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
