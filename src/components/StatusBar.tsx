import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScopes } from '@/hooks/useScopes';
import { useWorkflow } from '@/hooks/useWorkflow.tsx';
import { useTheme } from '@/hooks/useTheme';
import { formatScopeId } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { VersionBadge } from '@/components/VersionBadge';
import type { Scope } from '@/types';

export function StatusBar() {
  const { scopes } = useScopes();
  const { engine } = useWorkflow();
  const { neonGlass } = useTheme();
  const navigate = useNavigate();

  const boardColumns = useMemo(() => engine.getBoardColumns(), [engine]);
  const entryPointId = useMemo(() => engine.getEntryPoint().id, [engine]);

  const columnOrder = useMemo(() => {
    const map = new Map<string, number>();
    boardColumns.forEach((col, i) => map.set(col.id, i));
    return map;
  }, [boardColumns]);

  const columnColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const col of boardColumns) map.set(col.id, col.color);
    return map;
  }, [boardColumns]);

  const { inProgress, needsAttention } = useMemo(() => {
    const prog: Scope[] = [];
    const attn: Scope[] = [];

    for (const scope of scopes) {
      if (scope.status === entryPointId) continue;
      if (engine.isTerminalStatus(scope.status)) continue;

      if (scope.blocked_by.length > 0) {
        attn.push(scope);
      } else {
        prog.push(scope);
      }
    }

    return { inProgress: groupByStatus(prog, columnOrder), needsAttention: groupByStatus(attn, columnOrder) };
  }, [scopes, entryPointId, engine, columnOrder]);

  const handleBadgeClick = (e: React.MouseEvent, scopeId: number) => {
    e.stopPropagation();
    navigate(`/?highlight=${scopeId}`);
  };

  const hasScopes = inProgress.size > 0 || needsAttention.size > 0;

  return (
    <div className={cn(
      'fixed bottom-0 left-24 right-0 z-40 border-t border-border bg-surface/95 backdrop-blur-sm',
      neonGlass && 'ticker-glass'
    )}>
      <div className="flex items-center px-4 py-2">
        {/* Scrollable scope badges */}
        {hasScopes && (
          <div className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto">
            {inProgress.size > 0 && (
              <>
                <span className="flex-shrink-0 text-xxs uppercase tracking-wider font-normal text-muted-foreground">
                  In Progress
                </span>
                <ScopeBadges groups={inProgress} colorMap={columnColorMap} onClick={handleBadgeClick} />
              </>
            )}

            {inProgress.size > 0 && needsAttention.size > 0 && (
              <div className="h-4 w-px flex-shrink-0 bg-border" />
            )}

            {needsAttention.size > 0 && (
              <>
                <span className="flex-shrink-0 text-xxs uppercase tracking-wider font-normal text-warning-amber">
                  Needs Attention
                </span>
                <ScopeBadges groups={needsAttention} colorMap={columnColorMap} onClick={handleBadgeClick} />
              </>
            )}
          </div>
        )}

        {/* Spacer when no scopes */}
        {!hasScopes && <div className="flex-1" />}

        {/* Version badge — pinned right */}
        <div className="flex-shrink-0 ml-4">
          <VersionBadge />
        </div>
      </div>
    </div>
  );
}

function ScopeBadges({
  groups,
  colorMap,
  onClick,
}: {
  groups: Map<string, Scope[]>;
  colorMap: Map<string, string>;
  onClick: (e: React.MouseEvent, scopeId: number) => void;
}) {
  return (
    <>
      {Array.from(groups.entries()).map(([status, scopeList]) => {
        const color = colorMap.get(status) ?? '220 70% 50%';
        const hex = hslToHex(color);
        return scopeList.map((scope) => (
          <button
            key={scope.id}
            onClick={(e) => onClick(e, scope.id)}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-xxs transition-colors hover:brightness-125 cursor-pointer"
            style={{
              backgroundColor: `${hex}15`,
              borderColor: `${hex}40`,
            }}
          >
            <span
              className="h-2 w-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: `hsl(${color})` }}
            />
            <span className="max-w-[120px] truncate">
              {formatScopeId(scope.id)} {scope.title}
            </span>
          </button>
        ));
      })}
    </>
  );
}

function groupByStatus(scopes: Scope[], columnOrder: Map<string, number>): Map<string, Scope[]> {
  const map = new Map<string, Scope[]>();
  for (const scope of scopes) {
    const list = map.get(scope.status);
    if (list) list.push(scope);
    else map.set(scope.status, [scope]);
  }
  // Sort by column order
  return new Map(
    Array.from(map.entries()).sort(
      ([a], [b]) => (columnOrder.get(a) ?? 999) - (columnOrder.get(b) ?? 999)
    )
  );
}

function hslToHex(hsl: string): string {
  const parts = hsl.match(/[\d.]+/g);
  if (!parts || parts.length < 3) return '#888888';
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
