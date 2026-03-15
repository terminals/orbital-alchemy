import { Rocket } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { usePipeline } from '@/hooks/usePipeline';
import { EnvironmentStrip } from '@/components/EnvironmentStrip';
import { PromotionQueue } from '@/components/PromotionQueue';
import { DriftSidebar } from '@/components/DriftSidebar';
import { DeployHistory } from '@/components/DeployHistory';

export function DeployPipeline() {
  const { drift, frequency, deployments, loading } = usePipeline();

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Rocket className="h-4 w-4 text-primary" />
        <h1 className="text-xl font-light">Deploy Pipeline</h1>
        {deployments.length > 0 && (
          <Badge variant="secondary">
            {deployments.length} deploys
          </Badge>
        )}
      </div>

      {/* Section 1: Environment Status Strip */}
      {drift && (
        <div className="mb-6">
          <EnvironmentStrip drift={drift} />
        </div>
      )}

      {/* Section 2 + 3: Promotion Queue + Sidebar */}
      {drift && (
        <div className="mb-6 grid gap-6 lg:grid-cols-3">
          <PromotionQueue
            devToStaging={drift.devToStaging}
            stagingToMain={drift.stagingToMain}
          />
          <DriftSidebar
            drift={drift}
            frequency={frequency}
            deployments={deployments}
          />
        </div>
      )}

      {/* Section 4: Deployment History */}
      <DeployHistory deployments={deployments} />
    </div>
  );
}
