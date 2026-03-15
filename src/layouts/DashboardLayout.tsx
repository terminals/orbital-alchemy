import { NavLink, Outlet } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  LayoutDashboard,
  Bot,
  ShieldCheck,
  ShieldAlert,
  Rocket,
  Clock,
  Workflow,
  Wifi,
  WifiOff,
  Sparkles,
  Radar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSocket } from '@/hooks/useSocket';
import { useTheme } from '@/hooks/useTheme';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { EventTicker } from '@/components/EventTicker';
import { NeonGrid } from '@/components/NeonGrid';

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'KANBAN' },
  { to: '/agents', icon: Bot, label: 'AGENTS' },
  { to: '/gates', icon: ShieldCheck, label: 'GATES' },
  { to: '/enforcement', icon: ShieldAlert, label: 'RULES' },
  { to: '/pipeline', icon: Rocket, label: 'DEPLOY' },
  { to: '/sessions', icon: Clock, label: 'SESSIONS' },
  { to: '/workflow', icon: Workflow, label: 'WORKFLOW' },
] as const;

export function DashboardLayout() {
  const { connected } = useSocket();
  const { neonGlass, toggleNeonGlass } = useTheme();
  return (
    <div className="flex h-screen bg-background">
      {/* Neon background layer — subtle orbs + interactive grid */}
      {neonGlass && (
        <div className="neon-bg">
          <NeonGrid />
        </div>
      )}

      {/* Sidebar — compact icon-only */}
      <aside className={cn(
        'flex w-24 flex-col items-center border-r border-border bg-surface',
        neonGlass && 'sidebar-glass'
      )}>
        {/* Logo */}
        <div className="flex h-20 items-center justify-center">
          <div className={cn(
            'flex h-16 w-16 items-center justify-center rounded-xl',
            'bg-accent-blue text-white',
            neonGlass && 'logo-neon'
          )}>
            <Radar className="h-8 w-8" strokeWidth={1.5} />
          </div>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1">
          <nav className="flex flex-col items-center gap-3 px-4 py-2">
            {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'nav-item-square group relative flex h-16 w-16 flex-col items-center justify-center rounded-xl',
                    isActive
                      ? cn(
                          'bg-surface-light text-foreground',
                          neonGlass ? 'nav-icon-active-glow' : 'ring-1 ring-accent-blue/40'
                        )
                      : 'text-muted-foreground hover:bg-surface-light hover:text-foreground'
                  )
                }
              >
                <Icon className="h-6 w-6 transition-transform duration-200 group-hover:scale-110" />
                <span className="nav-item-label whitespace-nowrap text-[9px] font-light max-h-0 opacity-0 group-hover:max-h-3 group-hover:mt-1 group-hover:opacity-100 transition-all duration-200 overflow-hidden tracking-wider">
                  {label}
                </span>
              </NavLink>
            ))}
          </nav>
        </ScrollArea>

        {/* Bottom controls */}
        <div className="flex flex-col items-center gap-1 px-4 py-3">
          {/* Theme toggle */}
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={toggleNeonGlass}
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-lg cursor-pointer',
                  'transition-all duration-200',
                  neonGlass
                    ? 'text-accent-blue toggle-neon-active'
                    : 'text-muted-foreground hover:bg-surface-light hover:text-foreground'
                )}
              >
                <Sparkles className={cn('h-5 w-5', neonGlass && 'fill-current')} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={12}>
              Neon Glass
            </TooltipContent>
          </Tooltip>

          {/* Connection status */}
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg">
                {connected ? (
                  <Wifi className={cn('h-5 w-5 text-bid-green', neonGlass && 'connection-glow')} />
                ) : (
                  <WifiOff className="h-5 w-5 text-ask-red" />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={12}>
              {connected ? 'Connected' : 'Disconnected'}
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>

      {/* Main content */}
      <main className={cn('flex min-w-0 flex-1 flex-col overflow-hidden', neonGlass && 'relative z-[1]')}>
        <div className="flex flex-1 flex-col overflow-hidden p-4 pb-12">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>

      {/* Event ticker at bottom */}
      <EventTicker />
    </div>
  );
}
