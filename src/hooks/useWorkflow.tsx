import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { WorkflowEngine } from '../../shared/workflow-engine';
import { isWorkflowConfig } from '../../shared/workflow-config';
import { socket } from '../socket';

// ─── Context ──────────────────────────────────────────────

interface WorkflowContextValue {
  engine: WorkflowEngine;
}

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────

interface WorkflowProviderProps {
  children: ReactNode;
}

export function WorkflowProvider({ children }: WorkflowProviderProps) {
  const [engine, setEngine] = useState<WorkflowEngine | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/orbital/workflow');
      if (!res.ok) throw new Error(`Failed to load workflow: HTTP ${res.status}`);
      const json = await res.json() as { success: boolean; data?: unknown };
      const config: unknown = json.data ?? json;
      if (!isWorkflowConfig(config)) throw new Error('Invalid workflow config from server');
      setEngine(new WorkflowEngine(config));
      setError(null);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflow');
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Hot-reload: re-fetch when server config changes (scope 110 emits this)
  useEffect(() => {
    const handler = () => { loadConfig(); };
    socket.on('workflow:changed', handler);
    return () => { socket.off('workflow:changed', handler); };
  }, [loadConfig]);

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

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-xs text-muted-foreground">Loading workflow...</span>
        </div>
      </div>
    );
  }

  if (error || !engine) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 max-w-sm text-center">
          <span className="text-sm text-destructive">Workflow Error</span>
          <span className="text-xs text-muted-foreground">{error ?? 'Unknown error'}</span>
          <button
            onClick={() => { setLoading(true); loadConfig(); }}
            className="mt-2 rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
          >
            Retry
          </button>
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
