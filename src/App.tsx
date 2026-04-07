import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ProjectProvider } from '@/hooks/useProjectContext';
import { WorkflowProvider } from '@/hooks/useWorkflow';
import { ActiveDispatchContext, useActiveDispatchProvider } from '@/hooks/useActiveDispatches';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { ScopeBoard } from '@/views/ScopeBoard';
import { PrimitivesConfig } from '@/views/PrimitivesConfig';
import { QualityGates } from '@/views/QualityGates';
import { SourceControl } from '@/views/SourceControl';
import { SessionTimeline } from '@/views/SessionTimeline';
import { Settings } from '@/views/Settings';

const WorkflowVisualizer = lazy(() => import('@/views/WorkflowVisualizer'));

function AppInner() {
  const activeDispatchCtx = useActiveDispatchProvider();

  return (
    <ActiveDispatchContext.Provider value={activeDispatchCtx}>
      <TooltipProvider>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route index element={<ScopeBoard />} />
            <Route path="primitives" element={<PrimitivesConfig />} />
            <Route path="gates" element={<QualityGates />} />
            <Route path="enforcement" element={<Navigate to="/gates" replace />} />
            <Route path="repo" element={<SourceControl />} />
            <Route path="sessions" element={<SessionTimeline />} />
            <Route path="workflow" element={<Suspense fallback={<div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}><WorkflowVisualizer /></Suspense>} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </TooltipProvider>
    </ActiveDispatchContext.Provider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ProjectProvider>
      <WorkflowProvider>
        <AppInner />
      </WorkflowProvider>
      </ProjectProvider>
    </BrowserRouter>
  );
}
