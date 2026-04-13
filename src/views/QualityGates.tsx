import { ShieldCheck } from 'lucide-react';
import { ProjectTabBar } from '@/components/ProjectTabBar';
import { RulesPane } from '@/components/quality-gates/RulesPane';
import { ActivityPane } from '@/components/quality-gates/ActivityPane';
import { GatesPane } from '@/components/quality-gates/GatesPane';

export function QualityGates() {
  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <ProjectTabBar />
      <div className="mb-3 flex items-center gap-3">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <h1 className="text-xl font-light">Guards</h1>
      </div>
      <div className="flex flex-1 min-h-0 gap-4">
        {/* Left pane — Rules */}
        <div className="flex w-1/2 min-w-0 flex-col overflow-y-auto rounded-lg border border-border/50">
          <RulesPane />
        </div>
        {/* Right pane — Activity + CI */}
        <div className="flex w-1/2 min-w-0 flex-col space-y-4">
          <ActivityPane />
          <GatesPane />
        </div>
      </div>
    </div>
  );
}
