import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// ─── Diff Parser ─────────────────────────────────────────

interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'hunk' | 'meta';
  content: string;
  oldNum?: number;
  newNum?: number;
}

function parseDiff(raw: string): DiffLine[] {
  const lines = raw.split('\n');
  const result: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    // Hunk header: @@ -5,18 +5,14 @@
    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)/);
    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[2], 10);
      result.push({ type: 'hunk', content: line });
      continue;
    }

    // Meta lines (diff --git, index, ---, +++)
    if (line.startsWith('diff ') || line.startsWith('index ') ||
        line.startsWith('--- ') || line.startsWith('+++ ')) {
      result.push({ type: 'meta', content: line });
      continue;
    }

    if (line.startsWith('-')) {
      result.push({ type: 'remove', content: line.slice(1), oldNum: oldLine });
      oldLine++;
    } else if (line.startsWith('+')) {
      result.push({ type: 'add', content: line.slice(1), newNum: newLine });
      newLine++;
    } else {
      // Context line (starts with space or is empty)
      const content = line.startsWith(' ') ? line.slice(1) : line;
      result.push({ type: 'context', content, oldNum: oldLine, newNum: newLine });
      oldLine++;
      newLine++;
    }
  }

  return result;
}

// ─── Diff Viewer ─────────────────────────────────────────

function DiffViewer({ diff }: { diff: string }) {
  const lines = parseDiff(diff);

  // Compute gutter width based on max line number
  const maxNum = lines.reduce((m, l) => Math.max(m, l.oldNum ?? 0, l.newNum ?? 0), 0);
  const gutterWidth = String(maxNum).length;

  return (
    <div className="text-[11px] font-mono leading-[1.6] pb-1">
      {lines.map((line, i) => {
        if (line.type === 'meta') return null;

        if (line.type === 'hunk') {
          return (
            <div key={i} className="px-3 py-1.5 mt-1 first:mt-0 text-cyan-400/60 bg-cyan-500/5 border-y border-cyan-500/10 select-none">
              {line.content}
            </div>
          );
        }

        const oldGutter = line.oldNum != null ? String(line.oldNum).padStart(gutterWidth) : ''.padStart(gutterWidth);
        const newGutter = line.newNum != null ? String(line.newNum).padStart(gutterWidth) : ''.padStart(gutterWidth);

        const rowStyle = cn(
          'flex',
          line.type === 'add' && 'bg-green-500/10',
          line.type === 'remove' && 'bg-red-500/10',
        );

        const gutterStyle = cn(
          'select-none border-r border-border/40 px-2 text-right shrink-0',
          line.type === 'add' && 'text-green-400/40',
          line.type === 'remove' && 'text-red-400/40',
          line.type === 'context' && 'text-muted-foreground/25',
        );

        const contentStyle = cn(
          'px-3 whitespace-pre-wrap break-all flex-1 min-w-0',
          line.type === 'add' && 'text-green-400',
          line.type === 'remove' && 'text-red-400',
          line.type === 'context' && 'text-foreground/50',
        );

        const marker = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';

        return (
          <div key={i} className={rowStyle}>
            <span className={gutterStyle}>{oldGutter}</span>
            <span className={gutterStyle}>{newGutter}</span>
            <span className={cn(
              'w-4 text-center shrink-0 select-none',
              line.type === 'add' && 'text-green-400/60',
              line.type === 'remove' && 'text-red-400/60',
              line.type === 'context' && 'text-transparent',
            )}>{marker}</span>
            <span className={contentStyle}>{line.content || '\u00a0'}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Dialog ──────────────────────────────────────────────

interface DiffViewerDialogProps {
  diffFile: string | null;
  diffContent: string | null;
  diffFileStatus: string | null;
  diffProjectId: string | null;
  actionLoading: string | null;
  onResetFile: (projectId: string, file: string) => void;
  onClearDiff: () => void;
}

export function DiffViewerDialog({
  diffFile,
  diffContent,
  diffFileStatus,
  diffProjectId,
  actionLoading,
  onResetFile,
  onClearDiff,
}: DiffViewerDialogProps) {
  return (
    <Dialog open={diffFile !== null} onOpenChange={(open) => { if (!open) onClearDiff(); }}>
      <DialogContent className="max-w-2xl p-0 max-h-[80vh] overflow-hidden grid grid-rows-[auto_auto_auto_1fr_auto_auto]">
        {/* Header */}
        <DialogHeader className="px-5 pt-4 pb-3 pr-10">
          <DialogTitle className="text-sm font-mono">{diffFile}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground/60">
            Template → Your file
          </DialogDescription>
        </DialogHeader>

        <Separator />

        {/* Legend */}
        <div className="px-5 py-2 text-xs text-muted-foreground/50">
          <span className="text-red-400/70">−</span> template version
          <span className="mx-2">·</span>
          <span className="text-green-400/70">+</span> your local file
        </div>

        {/* Diff body — scrollable */}
        <div className="overflow-auto min-h-0">
          {diffContent ? (
            <DiffViewer diff={diffContent} />
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Loading diff...
            </div>
          )}
        </div>

        {/* Footer with contextual action */}
        <Separator />
        <div className="px-5 py-3 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost" size="sm">Close</Button>
          </DialogClose>
          {diffFileStatus === 'outdated' && diffProjectId && (
            <Button
              size="sm"
              onClick={() => { onResetFile(diffProjectId, diffFile!); onClearDiff(); }}
              disabled={actionLoading === `reset:${diffFile}`}
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              {actionLoading === `reset:${diffFile}` && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Update to latest
            </Button>
          )}
          {diffFileStatus === 'modified' && diffProjectId && (
            <Button
              size="sm"
              onClick={() => { onResetFile(diffProjectId, diffFile!); onClearDiff(); }}
              disabled={actionLoading === `reset:${diffFile}`}
              variant="outline"
            >
              {actionLoading === `reset:${diffFile}` && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Reset to template
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
