import { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { WorkflowEngine } from '../../shared/workflow-engine';
import { useProjects } from './useProjectContext';

// ─── Context ──────────────────────────────────────────────

interface WorkflowContextValue {
  engine: WorkflowEngine;
}

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────

interface WorkflowProviderProps {
  children: ReactNode;
}

/**
 * Provides the WorkflowEngine for the currently active project.
 *
 * Reads from ProjectProvider's cached `projectEngines` map — no independent
 * fetching. When "All Projects" is selected, returns the first project's engine
 * (individual views that need all engines use `useProjects().projectEngines`).
 */
export function WorkflowProvider({ children }: WorkflowProviderProps) {
  const { activeProjectId, projects, projectEngines } = useProjects();

  // Resolve the active engine from the cached map.
  // When "All Projects" is selected, prefer the first project's engine but fall
  // back to ANY loaded engine so the page doesn't stay blank while individual
  // project engines are still loading (or if the first project's fetch fails).
  const targetId = activeProjectId ?? projects[0]?.id ?? null;
  let engine = targetId ? projectEngines.get(targetId) ?? null : null;
  if (!engine && projectEngines.size > 0) {
    engine = projectEngines.values().next().value ?? null;
  }

  // Inject CSS variables from engine config onto document root
  useEffect(() => {
    if (!engine) return;
    const cssText = engine.generateCSSVariables();
    for (const line of cssText.split('\n')) {
      const match = line.match(/^(--[\w-]+):\s*(.+);$/);
      if (match) {
        document.documentElement.style.setProperty(match[1], match[2]);
      }
    }
  }, [engine]);

  if (!engine) {
    // No projects at all — show error
    if (projects.length === 0) {
      return (
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3 max-w-sm text-center">
            <span className="text-sm text-destructive">No Projects</span>
            <span className="text-xs text-muted-foreground">
              No projects registered. Run <code>orbital register</code> to add a project.
            </span>
          </div>
        </div>
      );
    }

    // Projects exist but no engine loaded yet — show spinner
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-xs text-muted-foreground">Loading workflow...</span>
        </div>
      </div>
    );
  }

  return (
    <WorkflowContext.Provider value={{ engine }}>
      {children}
    </WorkflowContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────

export function useWorkflow(): WorkflowContextValue {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error('useWorkflow must be used within a WorkflowProvider');
  return ctx;
}
