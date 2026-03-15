import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { ScopeBoard } from '@/views/ScopeBoard';
import { AgentFeed } from '@/views/AgentFeed';
import { QualityGates } from '@/views/QualityGates';
import { DeployPipeline } from '@/views/DeployPipeline';
import { SessionTimeline } from '@/views/SessionTimeline';
import { EnforcementView } from '@/views/EnforcementView';

const WorkflowVisualizer = lazy(() => import('@/views/WorkflowVisualizer'));

export default function App() {
  return (
    <BrowserRouter>
      <TooltipProvider>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route index element={<ScopeBoard />} />
            <Route path="agents" element={<AgentFeed />} />
            <Route path="gates" element={<QualityGates />} />
            <Route path="enforcement" element={<EnforcementView />} />
            <Route path="pipeline" element={<DeployPipeline />} />
            <Route path="sessions" element={<SessionTimeline />} />
            <Route path="workflow" element={<Suspense fallback={<div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}><WorkflowVisualizer /></Suspense>} />
          </Route>
        </Routes>
      </TooltipProvider>
    </BrowserRouter>
  );
}
