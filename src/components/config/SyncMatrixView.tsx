import { useGlobalSyncState } from '@/hooks/useSyncState';
import { SyncBadge } from './SyncBadge';

export function SyncMatrixView() {
  const { report, loading } = useGlobalSyncState();

  if (loading || !report) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (report.projects.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4">
        No projects registered. Use <code>orbital register</code> to add projects.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/50">
            <th className="text-left py-2 px-3 font-medium text-muted-foreground">File</th>
            {report.projects.map(p => (
              <th key={p.projectId} className="text-center py-2 px-3 font-medium text-muted-foreground">
                {p.projectName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.files.map(file => (
            <tr key={file} className="border-b border-border/20 hover:bg-muted/20">
              <td className="py-1.5 px-3 font-mono text-[11px] text-foreground/80">
                {file}
              </td>
              {report.projects.map(p => (
                <td key={p.projectId} className="py-1.5 px-3 text-center">
                  <SyncBadge state={p.states[file] ?? 'absent'} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
