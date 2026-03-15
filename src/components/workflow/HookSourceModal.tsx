import { useState, useEffect } from 'react';
import { FileCode2, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { UnifiedHook } from '../../../shared/workflow-config';

// ─── Types ──────────────────────────────────────────

interface HookSourceModalProps {
  hook: UnifiedHook | null;
  open: boolean;
  onClose: () => void;
}

interface HookSource {
  filePath: string;
  content: string;
  lineCount: number;
}

// ─── Component ──────────────────────────────────────────

export function HookSourceModal({ hook, open, onClose }: HookSourceModalProps) {
  const [source, setSource] = useState<HookSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hook || !open) { setSource(null); setError(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/orbital/workflow/hooks/source?path=${encodeURIComponent(hook.scriptPath)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          setError(body.error ?? `Failed to load source (HTTP ${res.status})`);
          setSource(null);
        } else {
          const json = await res.json() as { data: HookSource };
          setSource(json.data);
        }
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Network error'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [hook?.id, hook?.scriptPath, open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!hook) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-[min(56rem,calc(100vw_-_2rem))] h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 pr-8">
            <FileCode2 className="h-4 w-4 shrink-0 text-zinc-500" />
            <DialogTitle className="text-sm font-medium text-foreground leading-tight truncate">
              {hook.label}
            </DialogTitle>
          </div>
          <DialogDescription className="mt-1 font-mono text-[11px] text-zinc-500 truncate">
            {hook.scriptPath}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 border-t border-zinc-800 bg-[#0a0a12]">
          <ScrollArea className="h-full">
            <div className="px-2 py-3">
              {loading && (
                <div className="flex items-center gap-2 px-4 py-8 text-xs text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading source...
                </div>
              )}
              {error && (
                <div className="px-4 py-8 text-xs text-red-400">
                  <FileCode2 className="mb-2 h-5 w-5 text-zinc-600" />
                  {error}
                </div>
              )}
              {source && <SourceViewer content={source.content} filePath={source.filePath} />}
              {!loading && !error && !source && (
                <div className="px-4 py-8 text-xs text-zinc-600 italic">No source available</div>
              )}
            </div>
          </ScrollArea>
        </div>

        {source && (
          <div className="border-t border-zinc-800 px-4 py-2 text-[10px] text-zinc-600">
            {source.lineCount} lines
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-components ─────────────────────────────────────

function SourceViewer({ content, filePath }: { content: string; filePath: string }) {
  const lines = content.split('\n');
  const gutterWidth = String(lines.length).length;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 rounded border border-zinc-800/50 bg-zinc-900/50 px-3 py-1.5 font-mono text-[10px] text-zinc-500">
        <FileCode2 className="h-3 w-3 shrink-0" />
        {filePath}
      </div>
      <pre className="font-mono text-[12px] leading-[1.6]">
        {lines.map((line, i) => (
          <div key={i} className="flex hover:bg-white/[0.02]">
            <span
              className="select-none text-right text-zinc-700 pr-3 shrink-0"
              style={{ width: `${gutterWidth + 2}ch` }}
            >
              {i + 1}
            </span>
            <span className="text-zinc-300 whitespace-pre overflow-x-auto">{line || ' '}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}
