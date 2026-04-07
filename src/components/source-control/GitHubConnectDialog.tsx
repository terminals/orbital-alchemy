import { useState, useEffect, useRef, useCallback } from 'react';
import { Github, Globe, Key, Loader2, Check, AlertCircle, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useProjectUrl } from '@/hooks/useProjectUrl';

interface Props {
  error: string | null;
  onConnected: () => void;
}

type AuthMethod = 'oauth' | 'pat';
type ConnectState = 'idle' | 'connecting' | 'polling' | 'success' | 'error';

export function GitHubConnectDialog({ error, onConnected }: Props) {
  const buildUrl = useProjectUrl();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<AuthMethod>('oauth');
  const [state, setState] = useState<ConnectState>('idle');
  const [token, setToken] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const isNotInstalled = error?.includes('not installed');

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = undefined;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => stopPolling, [stopPolling]);

  const handleOAuth = async () => {
    setState('connecting');
    setErrorMsg('');
    try {
      const res = await fetch(buildUrl('/github/connect'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'oauth' }),
      });
      const data = await res.json();
      if (data.success) {
        setState('polling');
        // Poll for auth status every 2 seconds
        pollRef.current = setInterval(async () => {
          try {
            const statusRes = await fetch(buildUrl('/github/auth-status'));
            const status = await statusRes.json();
            if (status.authenticated) {
              stopPolling();
              setState('success');
              setTimeout(() => {
                setOpen(false);
                onConnected();
              }, 1000);
            }
          } catch { /* keep polling */ }
        }, 2000);

        // Auto-stop after 2 minutes
        setTimeout(() => {
          if (pollRef.current) {
            stopPolling();
            setState('error');
            setErrorMsg('Authentication timed out. Please try again.');
          }
        }, 120_000);
      } else {
        setState('error');
        setErrorMsg(data.error ?? 'Failed to start OAuth flow');
      }
    } catch {
      setState('error');
      setErrorMsg('Failed to connect to server');
    }
  };

  const handlePAT = async () => {
    if (!token.trim()) return;
    setState('connecting');
    setErrorMsg('');
    try {
      const res = await fetch(buildUrl('/github/connect'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'pat', token: token.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setState('success');
        setToken('');
        setTimeout(() => {
          setOpen(false);
          onConnected();
        }, 1000);
      } else {
        setState('error');
        setErrorMsg(data.error ?? 'Authentication failed');
      }
    } catch {
      setState('error');
      setErrorMsg('Failed to connect to server');
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      stopPolling();
      setState('idle');
      setErrorMsg('');
      setToken('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Github className="h-4 w-4" />
          Connect GitHub
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            Connect to GitHub
          </DialogTitle>
          <DialogDescription>
            {isNotInstalled
              ? 'The GitHub CLI (gh) is required. Install it first, then authenticate.'
              : 'Authenticate with GitHub to see PRs, CI status, and repo info.'}
          </DialogDescription>
        </DialogHeader>

        {isNotInstalled ? (
          <div className="space-y-3">
            <div className="rounded border border-border bg-surface-light p-3">
              <p className="text-sm mb-2">Install the GitHub CLI:</p>
              <code className="text-xs font-mono bg-background px-2 py-1 rounded">brew install gh</code>
              <p className="mt-2 text-xs text-muted-foreground">
                Or visit{' '}
                <a
                  href="https://cli.github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-primary hover:underline"
                >
                  cli.github.com <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Method tabs */}
            <div className="flex gap-1 rounded-md bg-surface-light p-1">
              <button
                onClick={() => setMethod('oauth')}
                className={`flex-1 flex items-center justify-center gap-2 rounded px-3 py-2 text-sm transition-colors ${
                  method === 'oauth'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Globe className="h-4 w-4" />
                Browser OAuth
              </button>
              <button
                onClick={() => setMethod('pat')}
                className={`flex-1 flex items-center justify-center gap-2 rounded px-3 py-2 text-sm transition-colors ${
                  method === 'pat'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Key className="h-4 w-4" />
                Access Token
              </button>
            </div>

            {/* OAuth flow */}
            {method === 'oauth' && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Opens your browser to authenticate with GitHub. This is the recommended method.
                </p>
                <Button
                  onClick={handleOAuth}
                  disabled={state === 'connecting' || state === 'polling' || state === 'success'}
                  className="w-full gap-2"
                >
                  {state === 'connecting' && <Loader2 className="h-4 w-4 animate-spin" />}
                  {state === 'polling' && <Loader2 className="h-4 w-4 animate-spin" />}
                  {state === 'success' && <Check className="h-4 w-4" />}
                  {state === 'polling'
                    ? 'Waiting for browser...'
                    : state === 'success'
                    ? 'Connected!'
                    : 'Connect with GitHub'}
                </Button>
              </div>
            )}

            {/* PAT flow */}
            {method === 'pat' && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Paste a GitHub Personal Access Token. Needs <code className="text-xs">repo</code> and <code className="text-xs">read:org</code> scopes.
                </p>
                <input
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  value={token}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToken(e.target.value)}
                  disabled={state === 'connecting' || state === 'success'}
                  className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                />
                <Button
                  onClick={handlePAT}
                  disabled={!token.trim() || state === 'connecting' || state === 'success'}
                  className="w-full gap-2"
                >
                  {state === 'connecting' && <Loader2 className="h-4 w-4 animate-spin" />}
                  {state === 'success' && <Check className="h-4 w-4" />}
                  {state === 'success' ? 'Connected!' : 'Authenticate'}
                </Button>
              </div>
            )}

            {/* Error message */}
            {state === 'error' && errorMsg && (
              <div className="flex items-center gap-2 rounded bg-ask-red/10 px-3 py-2 text-xs text-ask-red">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {errorMsg}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground/60">
              GitHub authentication is global — connecting here applies to all projects.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
