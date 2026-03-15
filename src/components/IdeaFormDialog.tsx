import { useState, useEffect, useRef } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface IdeaFormDialogProps {
  open: boolean;
  loading: boolean;
  onSubmit: (title: string, description: string) => void;
  onCancel: () => void;
  onSurprise: () => void;
  surpriseLoading: boolean;
}

export function IdeaFormDialog({ open, loading, onSubmit, onCancel, onSurprise, surpriseLoading }: IdeaFormDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset fields and focus on open
  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  function handleSubmit() {
    if (!title.trim()) return;
    onSubmit(title.trim(), description.trim());
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <DialogContent className="max-w-lg p-5 gap-0" onKeyDown={handleKeyDown}>
        <DialogHeader className="mb-4">
          <DialogTitle className="text-sm font-normal">New Idea</DialogTitle>
          <DialogDescription className="text-xxs text-muted-foreground">
            Capture a feature idea for the icebox
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          className="mb-3 w-full rounded bg-muted/50 px-3 py-2 text-sm text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground"
          placeholder="Feature name..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <textarea
          className="mb-4 w-full rounded bg-muted/50 px-3 py-2.5 text-xs text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary/50 resize-y placeholder:text-muted-foreground"
          placeholder="Describe the idea... What problem does it solve? Any notes on approach?"
          rows={6}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleSubmit} disabled={loading || !title.trim()} className="flex-1">
            {loading ? 'Creating...' : 'Create'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <span className="ml-auto text-[10px] text-muted-foreground/50">
            {'\u2318'}+Enter
          </span>
        </div>

        {/* Surprise Me */}
        <div className="mt-4 pt-4 border-t border-border">
          <Button
            size="sm"
            variant="outline"
            className="w-full text-purple-400 border-purple-500/30 hover:bg-purple-500/10 hover:border-purple-500/50"
            onClick={onSurprise}
            disabled={surpriseLoading}
          >
            {surpriseLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                Generating ideas...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 mr-2" />
                Surprise Me
              </>
            )}
          </Button>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
            AI analyzes the codebase and suggests feature ideas
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
