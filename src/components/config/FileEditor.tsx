import { useEffect, useCallback } from 'react';
import { Save, FileText, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MonoEditor } from './MonoEditor';
import type { ConfigPrimitiveType } from '@/types';

interface FileEditorProps {
  type: ConfigPrimitiveType | null;
  filePath: string | null;
  content: string;
  setContent: (value: string) => void;
  frontmatter: Record<string, string>;
  setFrontmatterField: (key: string, value: string) => void;
  body: string;
  setBody: (value: string) => void;
  dirty: boolean;
  saving: boolean;
  loading: boolean;
  error: string | null;
  onSave: () => Promise<void>;
}

export function FileEditor({
  filePath,
  content: _content,
  setContent: _setContent,
  frontmatter,
  setFrontmatterField,
  body,
  setBody,
  dirty,
  saving,
  loading,
  error,
  onSave,
}: FileEditorProps) {
  // Cmd+S / Ctrl+S save handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (dirty && !saving) onSave();
      }
    },
    [dirty, saving, onSave],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Empty state
  if (!filePath) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground/60">
            Select a file to edit
          </p>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const frontmatterKeys = Object.keys(frontmatter);
  const hasFrontmatter = frontmatterKeys.length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-xs text-foreground">{filePath}</span>
          {dirty && (
            <Badge variant="warning" className="shrink-0 text-[10px] px-1 py-0">
              unsaved
            </Badge>
          )}
        </div>
        <Button
          variant="default"
          size="sm"
          disabled={!dirty || saving}
          onClick={onSave}
          className="shrink-0"
        >
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-ask-red">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Frontmatter form */}
      {hasFrontmatter && (
        <div className="space-y-2 border-b border-border px-3 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
              Frontmatter
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="grid gap-2">
            {frontmatterKeys.map((key) => (
              <div key={key} className="flex items-center gap-2">
                <label className="w-28 shrink-0 text-right text-xxs text-muted-foreground">
                  {key}
                </label>
                <input
                  value={frontmatter[key] ?? ''}
                  onChange={(e) => setFrontmatterField(key, e.target.value)}
                  className={cn(
                    'flex-1 rounded border border-border bg-surface px-2 py-1 text-xs text-foreground',
                    'outline-none focus:border-accent-blue/50 transition-colors',
                  )}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Body editor — fills remaining height */}
      <div className="flex flex-1 flex-col min-h-0 p-3">
        {hasFrontmatter && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
              Content
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
        )}
        <MonoEditor value={body} onChange={setBody} filePath={filePath} />
      </div>
    </div>
  );
}
