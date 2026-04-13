import { useState } from 'react';
import { Layers, Settings2 } from 'lucide-react';
import { useProjects } from '@/hooks/useProjectContext';
import { cn } from '@/lib/utils';
import { ProjectSettingsModal } from './ProjectSettingsModal';

interface ProjectTabBarProps {
  /** Optional per-project count overrides (keyed by project ID). When provided, these replace scopeCount in the badges. */
  countOverrides?: Record<string, number>;
}

export function ProjectTabBar({ countOverrides }: ProjectTabBarProps = {}) {
  const { projects, activeProjectId, setActiveProjectId, hasMultipleProjects } = useProjects();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Don't render if there's only one project
  if (!hasMultipleProjects) return null;

  const isAllActive = activeProjectId === null;

  return (
    <div className="project-tab-bar -mt-8 mb-3 flex items-center gap-0.5 overflow-x-auto rounded border border-white/[0.08] px-1 py-1">
      {/* All Projects tab */}
      <button
        type="button"
        onClick={() => setActiveProjectId(null)}
        className={cn(
          'flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium whitespace-nowrap',
          'transition-all duration-300 ease-in-out border-b-2',
          isAllActive
            ? 'text-foreground'
            : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-white/[0.06]',
        )}
        style={isAllActive ? {
          background: 'rgba(255, 255, 255, 0.08)',
          boxShadow: '0 2px 12px rgba(255, 255, 255, 0.12)',
          borderBottomColor: 'rgba(255, 255, 255, 0.50)',
        } : undefined}
      >
        <Layers className="h-3 w-3" />
        All Projects
        <span className={cn(
          'ml-1 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums border',
          isAllActive ? 'glass-pill' : 'bg-muted border-transparent',
        )}>
          {countOverrides
            ? projects.filter(p => p.enabled).reduce((sum, p) => sum + (countOverrides[p.id] ?? 0), 0)
            : projects.filter(p => p.enabled).reduce((sum, p) => sum + p.scopeCount, 0)}
        </span>
      </button>

      <div className="mx-0.5 h-4 w-px bg-white/[0.08]" />

      {/* Per-project tabs (hidden projects excluded) */}
      {projects.filter((p) => p.enabled).map((project) => {
        const isActive = activeProjectId === project.id;
        return (
          <button
            type="button"
            key={project.id}
            onClick={() => setActiveProjectId(project.id)}
            className={cn(
              'flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium whitespace-nowrap',
              'transition-all duration-300 ease-in-out border-b-2',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-white/[0.06]',
            )}
            style={isActive ? {
              background: `hsl(${project.color} / 0.10)`,
              boxShadow: `0 2px 12px hsl(${project.color} / 0.25)`,
              borderBottomColor: `hsl(${project.color} / 0.50)`,
            } : undefined}
          >
            {/* Color dot */}
            <span
              className={cn('h-2 w-2 rounded-full shrink-0 transition-shadow duration-300', isActive && 'shadow-[0_0_6px_currentColor]')}
              style={{ backgroundColor: `hsl(${project.color})` }}
            />
            {project.name}
            <span className={cn(
              'ml-1 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums border',
              isActive ? 'glass-pill' : 'bg-muted border-transparent',
            )}>
              {countOverrides ? (countOverrides[project.id] ?? 0) : project.scopeCount}
            </span>
            {project.status === 'offline' && (
              <span className="text-[10px] text-muted-foreground/60">(offline)</span>
            )}
          </button>
        );
      })}

      {/* Edit button */}
      <div className="ml-auto shrink-0 pl-1">
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex items-center justify-center rounded p-1.5 text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.06] transition-colors"
          title="Project settings"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <ProjectSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        projects={projects}
      />
    </div>
  );
}
