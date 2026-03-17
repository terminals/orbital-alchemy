import { Terminal, ExternalLink } from 'lucide-react';

interface Props {
  error: string | null;
}

export function GitHubSetupGuide({ error }: Props) {
  const isNotInstalled = error?.includes('not installed');

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {isNotInstalled
          ? 'The GitHub CLI (gh) is required to connect your repository.'
          : 'Authenticate with GitHub to see PRs, repo info, and more.'}
      </p>

      <div className="space-y-3">
        {isNotInstalled && (
          <div className="rounded border border-border bg-surface-light p-3">
            <h4 className="mb-1.5 text-xs font-medium">1. Install GitHub CLI</h4>
            <div className="flex items-center gap-2 rounded bg-background px-3 py-2 font-mono text-xs">
              <Terminal className="h-3 w-3 shrink-0 text-muted-foreground" />
              <code>brew install gh</code>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
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
        )}

        <div className="rounded border border-border bg-surface-light p-3">
          <h4 className="mb-1.5 text-xs font-medium">
            {isNotInstalled ? '2' : '1'}. Authenticate
          </h4>
          <div className="flex items-center gap-2 rounded bg-background px-3 py-2 font-mono text-xs">
            <Terminal className="h-3 w-3 shrink-0 text-muted-foreground" />
            <code>gh auth login</code>
          </div>
        </div>
      </div>
    </div>
  );
}
