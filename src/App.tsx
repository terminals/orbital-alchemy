import { lazy, Suspense, Component, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ProjectProvider } from '@/hooks/useProjectContext';
import { WorkflowProvider } from '@/hooks/useWorkflow';
import { ActiveDispatchContext, useActiveDispatchProvider } from '@/hooks/useActiveDispatches';
import { OnboardingProvider } from '@/components/onboarding/OnboardingProvider';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { ScopeBoard } from '@/views/ScopeBoard';

// Lazy-load secondary views — chunks are preloaded below so navigation is instant
const primitivesImport = () => import('@/views/PrimitivesConfig').then(m => ({ default: m.PrimitivesConfig }));
const qualityGatesImport = () => import('@/views/QualityGates').then(m => ({ default: m.QualityGates }));
const sourceControlImport = () => import('@/views/SourceControl').then(m => ({ default: m.SourceControl }));
const sessionTimelineImport = () => import('@/views/SessionTimeline').then(m => ({ default: m.SessionTimeline }));
const settingsImport = () => import('@/views/Settings').then(m => ({ default: m.Settings }));
const workflowImport = () => import('@/views/WorkflowVisualizer');
const landingImport = () => import('@/views/Landing').then(m => ({ default: m.Landing }));

const PrimitivesConfig = lazy(primitivesImport);
const QualityGates = lazy(qualityGatesImport);
const SourceControl = lazy(sourceControlImport);
const SessionTimeline = lazy(sessionTimelineImport);
const Settings = lazy(settingsImport);
const WorkflowVisualizer = lazy(workflowImport);
const Landing = lazy(landingImport);

// Preload all chunks once the main bundle is idle so navigation never triggers Suspense
requestIdleCallback(() => {
  primitivesImport();
  qualityGatesImport();
  sourceControlImport();
  sessionTimelineImport();
  settingsImport();
  workflowImport();
});

class OnboardingErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { console.error('Onboarding error:', error); }
  render() {
    // On error, skip OnboardingProvider — useOnboarding() returns a safe
    // inactive default when the context is missing, so SpotlightOverlay
    // renders nothing and the rest of the app works normally.
    return this.state.hasError
      ? <TooltipProvider>{this.props.children}</TooltipProvider>
      : <OnboardingProvider><TooltipProvider>{this.props.children}</TooltipProvider></OnboardingProvider>;
  }
}

function AppInner() {
  const activeDispatchCtx = useActiveDispatchProvider();

  return (
    <ActiveDispatchContext.Provider value={activeDispatchCtx}>
      <OnboardingErrorBoundary>
        <Routes>
          <Route path="landing" element={<Suspense fallback={null}><Landing /></Suspense>} />
          <Route element={<DashboardLayout />}>
            <Route index element={<ScopeBoard />} />
            <Route path="primitives" element={<PrimitivesConfig />} />
            <Route path="guards" element={<QualityGates />} />
            <Route path="gates" element={<Navigate to="/guards" replace />} />
            <Route path="enforcement" element={<Navigate to="/guards" replace />} />
            <Route path="repo" element={<SourceControl />} />
            <Route path="sessions" element={<SessionTimeline />} />
            <Route path="workflow" element={<WorkflowVisualizer />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </OnboardingErrorBoundary>
    </ActiveDispatchContext.Provider>
  );
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProjectProvider>
      <WorkflowProvider>
        <AppInner />
      </WorkflowProvider>
      </ProjectProvider>
    </BrowserRouter>
  );
}
