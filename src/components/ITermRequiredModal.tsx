import { useState, useEffect, useRef } from 'react';
import { Terminal, Download, ExternalLink, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ITermRequiredModalProps {
  open: boolean;
  status: 'installed' | 'not-installed';
  onRetry: () => void;
  onCancel: () => void;
  launchAndWait: () => Promise<boolean>;
}

export function ITermRequiredModal({
  open,
  status,
  onRetry,
  onCancel,
  launchAndWait,
}: ITermRequiredModalProps) {
  const [launching, setLaunching] = useState(false);
  const [checking, setChecking] = useState(false);
  const [launchFailed, setLaunchFailed] = useState(false);
  const openRef = useRef(open);

  // Track open state for async cancellation
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Reset transient state when modal opens
  useEffect(() => {
    if (open) {
      setLaunching(false);
      setChecking(false);
      setLaunchFailed(false);
    }
  }, [open]);

  async function handleLaunch() {
    setLaunching(true);
    setLaunchFailed(false);
    const ok = await launchAndWait();
    if (!openRef.current) return; // user cancelled mid-launch
    setLaunching(false);
    if (ok) {
      onRetry();
    } else {
      setLaunchFailed(true);
    }
  }

  async function handleCheckAgain() {
    setChecking(true);
    const ok = await launchAndWait();
    if (!openRef.current) return; // user cancelled mid-check
    setChecking(false);
    if (ok) {
      onRetry();
    }
  }

  const isNotInstalled = status === 'not-installed';

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Terminal className="h-4.5 w-4.5 text-primary" />
            </div>
            <DialogTitle className="text-base font-medium">
              {isNotInstalled ? 'iTerm2 Required' : 'iTerm2 Not Running'}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
            {isNotInstalled ? (
              <>
                Orbital Command uses iTerm2 to manage terminal sessions for dispatch.
                Categorized windows, tab grouping, and session naming all require iTerm2.
              </>
            ) : (
              <>
                iTerm2 is installed but not currently running.
                It needs to be open for Orbital Command to dispatch sessions.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-5 space-y-3">
          {/* Launch failed warning */}
          {launchFailed && (
            <div className="flex items-start gap-2 rounded border border-warning-amber/30 bg-warning-amber/10 px-3 py-2 text-xs text-warning-amber">
              <span>Could not start iTerm2 automatically. Please open it manually and try again.</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2">
            {isNotInstalled ? (
              <>
                <Button asChild className="w-full">
                  <a
                    href="https://iterm2.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download iTerm2
                    <ExternalLink className="ml-2 h-3 w-3 opacity-50" />
                  </a>
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCheckAgain}
                  disabled={checking}
                  className="w-full"
                >
                  {checking ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    'Check Again'
                  )}
                </Button>
              </>
            ) : (
              <Button
                onClick={handleLaunch}
                disabled={launching}
                className="w-full"
              >
                {launching ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Opening iTerm2...
                  </>
                ) : (
                  <>
                    <Terminal className="mr-2 h-4 w-4" />
                    Open iTerm2
                  </>
                )}
              </Button>
            )}

            <Button
              variant="ghost"
              onClick={onCancel}
              disabled={launching || checking}
              className="w-full"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
