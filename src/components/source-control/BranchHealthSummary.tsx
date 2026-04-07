import { GitBranch, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ProjectBranchHealth } from '@/types';

interface Props {
  health: ProjectBranchHealth[];
}

function driftColor(severity: string): string {
  if (severity === 'clean') return 'text-bid-green';
  if (severity === 'low') return 'text-accent-blue';
  if (severity === 'moderate') return 'text-warning-amber';
  return 'text-ask-red';
}

export function BranchHealthSummary({ health }: Props) {
  if (health.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <GitBranch className="h-4 w-4 text-primary" />
            Branch Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-4 text-center">No branch data available.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <GitBranch className="h-4 w-4 text-primary" />
          Branch Health
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {health.map(proj => (
            <div
              key={proj.projectId}
              className="flex items-center gap-3 rounded px-2.5 py-2 transition-colors hover:bg-surface-light"
            >
              {/* Project dot + name */}
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: `hsl(${proj.projectColor})` }}
              />
              <span className="text-sm font-medium min-w-[100px]" style={{ color: `hsl(${proj.projectColor})` }}>
                {proj.projectName}
              </span>

              {/* Branch count */}
              <span className="text-xs text-muted-foreground">
                {proj.branchCount} branch{proj.branchCount !== 1 ? 'es' : ''}
              </span>

              {/* Stale branches */}
              {proj.staleBranchCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-warning-amber">
                  <AlertTriangle className="h-3 w-3" />
                  {proj.staleBranchCount} stale
                </span>
              )}

              {/* Feature branches */}
              {proj.featureBranchCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {proj.featureBranchCount} feature
                </Badge>
              )}

              {/* Drift severity */}
              <Badge
                variant="outline"
                className={cn('ml-auto text-xs', driftColor(proj.maxDriftSeverity))}
              >
                {proj.maxDriftSeverity === 'clean' ? 'in sync' : `${proj.maxDriftSeverity} drift`}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
