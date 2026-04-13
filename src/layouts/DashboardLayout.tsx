import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  LayoutDashboard,
  Puzzle,
  ShieldCheck,
  GitFork,
  Clock,
  Workflow,
  Settings as SettingsIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { useSettings } from '@/hooks/useSettings';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StatusBar } from '@/components/StatusBar';
import { NeonGrid } from '@/components/NeonGrid';
import { SpotlightOverlay } from '@/components/onboarding/SpotlightOverlay';

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'KANBAN', tourId: 'nav-kanban' },
  { to: '/primitives', icon: Puzzle, label: 'PRIMITIVES', tourId: 'nav-primitives' },
  { to: '/guards', icon: ShieldCheck, label: 'GUARDS', tourId: 'nav-guards' },
  { to: '/repo', icon: GitFork, label: 'REPO', tourId: 'nav-repo' },
  { to: '/sessions', icon: Clock, label: 'SESSIONS', tourId: 'nav-sessions' },
  { to: '/workflow', icon: Workflow, label: 'WORKFLOW', tourId: 'nav-workflow' },
] as const;

const LazyFallback = (
  <div className="flex flex-1 min-h-0 items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

export function DashboardLayout() {
  const { settings } = useSettings();
  const search = new URLSearchParams(window.location.search).toString();
  const searchStr = search ? `?${search}` : '';
  useTheme();
  return (
    <div className="flex h-screen bg-background">
      {/* Neon background layer */}
      {settings.showBackgroundEffects && (
        <div className="neon-bg">
          <NeonGrid />
        </div>
      )}

      {/* Sidebar — compact icon-only */}
      <aside className="flex w-24 flex-col items-center border-r border-border bg-surface sidebar-glass">

        {/* Logo */}
        <div className="flex h-20 items-center justify-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-xl text-white overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #6FC985 0%, #5ABF87 6.25%, #45B588 12.5%, #2FAA89 18.75%, #15A089 25%, #009588 31.25%, #008A87 37.5%, #007F84 43.75%, #007480 50%, #00697A 56.25%, #005E74 62.5%, #00546C 68.75%, #004964 75%, #023F5B 81.25%, #0A3551 87.5%, #0E2B46 93.75%, #10223B 100%)' }}
          >
            <img src="/scanner-sweep.png" alt="Orbital Command" className="h-12 w-12 object-contain" />
          </div>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1">
          <nav className="flex flex-col items-center gap-3 px-4 py-2">
            {NAV_ITEMS.map(({ to, icon: Icon, label, tourId }) => (
              <NavLink
                key={to}
                to={`${to}${searchStr}`}
                end={to === '/'}
                data-tour={tourId}
                className={({ isActive }) =>
                  cn(
                    'nav-item-square group relative flex h-16 w-16 flex-col items-center justify-center rounded-xl ',
                    isActive
                      ? 'bg-surface-light text-foreground nav-icon-active-glow'
                      : 'text-muted-foreground hover:bg-surface-light hover:text-foreground'
                  )
                }
              >
                <Icon className="h-6 w-6" />
                <span className="nav-item-label whitespace-nowrap text-[9px] font-light max-h-0 opacity-0 group-hover:max-h-3 group-hover:mt-1 group-hover:opacity-100 transition-all duration-200 overflow-hidden tracking-wider">
                  {label}
                </span>
              </NavLink>
            ))}
          </nav>
        </ScrollArea>

        {/* Settings — anchored at bottom */}
        <div className="px-4 py-3 border-t border-border/40">
          <NavLink
            to={`/settings${searchStr}`}
            data-tour="nav-settings"
            className={({ isActive }) =>
              cn(
                'nav-item-square group relative flex h-16 w-16 flex-col items-center justify-center rounded-xl ',
                isActive
                  ? 'bg-surface-light text-foreground nav-icon-active-glow'
                  : 'text-muted-foreground hover:bg-surface-light hover:text-foreground'
              )
            }
          >
            <SettingsIcon className="h-6 w-6" />
            <span className="nav-item-label whitespace-nowrap text-[9px] font-light max-h-0 opacity-0 group-hover:max-h-3 group-hover:mt-1 group-hover:opacity-100 transition-all duration-200 overflow-hidden tracking-wider">
              SETTINGS
            </span>
          </NavLink>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden relative z-[1]" style={settings.fontScale !== 1 ? { zoom: settings.fontScale } : undefined}>
        <div className="flex flex-1 flex-col overflow-hidden p-4 pt-12 pb-0">
          <ErrorBoundary>
            <Suspense fallback={LazyFallback}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>

      {/* Status bar at bottom */}
      {settings.showStatusBar && <StatusBar />}

      {/* Onboarding tour overlay */}
      <SpotlightOverlay />
    </div>
  );
}
