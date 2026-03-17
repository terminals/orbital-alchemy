import { useState, useMemo } from 'react';
import { Bot, Code2, Shield, Wrench, Search, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AgentEditorProps {
  frontmatter: Record<string, string>;
  setFrontmatterField: (key: string, value: string) => void;
  body: string;
  setBody: (value: string) => void;
  filePath: string;
}

const TEAM_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  'red-team':   { bg: 'bg-red-500/15',    text: 'text-red-400',    label: 'Red Team' },
  'blue-team':  { bg: 'bg-cyan-500/15',   text: 'text-cyan-400',   label: 'Blue Team' },
  'green-team': { bg: 'bg-green-500/15',  text: 'text-green-400',  label: 'Green Team' },
};

function detectTeam(filePath: string): { bg: string; text: string; label: string } | null {
  const lower = filePath.toLowerCase();
  for (const [key, style] of Object.entries(TEAM_COLORS)) {
    if (lower.includes(key)) return style;
  }
  return null;
}

/** Parse auto-trigger patterns from agent markdown body */
function parseAutoTriggers(body: string): string[] {
  const triggers: string[] = [];
  const lines = body.split('\n');
  let inTriggerSection = false;
  for (const line of lines) {
    if (/auto[- ]?trigger/i.test(line) || /auto[- ]?invoke/i.test(line)) {
      inTriggerSection = true;
      continue;
    }
    if (inTriggerSection && line.trim().startsWith('-')) {
      triggers.push(line.trim().replace(/^-\s*/, ''));
    } else if (inTriggerSection && line.trim() === '') {
      // blank line continues
    } else if (inTriggerSection && !line.trim().startsWith('-')) {
      inTriggerSection = false;
    }
  }
  return triggers;
}

export function AgentEditor({ frontmatter, setFrontmatterField, body, setBody, filePath }: AgentEditorProps) {
  const [rawMode, setRawMode] = useState(false);
  const team = useMemo(() => detectTeam(filePath), [filePath]);
  const triggers = useMemo(() => parseAutoTriggers(body), [body]);

  if (rawMode) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
            Raw Markdown
          </span>
          <Button variant="ghost" size="sm" onClick={() => setRawMode(false)} className="text-[10px] h-6">
            Structured View
          </Button>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={cn(
            'w-full min-h-[300px] resize-y rounded border border-border bg-surface p-3',
            'font-mono text-xs text-foreground leading-relaxed',
            'outline-none focus:border-accent-blue/50 transition-colors',
          )}
          spellCheck={false}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
              Agent Identity
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setRawMode(true)} className="text-[10px] h-6">
            <Code2 className="mr-1 h-3 w-3" /> Raw
          </Button>
        </div>

        <div className="grid gap-2">
          {Object.keys(frontmatter).map((key) => (
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

      {/* Team & metadata */}
      <div className="flex flex-wrap gap-2">
        {team && (
          <Badge className={cn('text-[10px]', team.bg, team.text, 'border-0')}>
            <Shield className="mr-1 h-3 w-3" /> {team.label}
          </Badge>
        )}
        {frontmatter.blocking === 'true' && (
          <Badge variant="destructive" className="text-[10px]">
            Blocking
          </Badge>
        )}
        {frontmatter.priority && (
          <Badge variant="secondary" className="text-[10px]">
            Priority: {frontmatter.priority}
          </Badge>
        )}
      </div>

      {/* Auto-triggers */}
      {triggers.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Zap className="h-3 w-3 text-muted-foreground" />
            <span className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
              Auto-Invoke Triggers
            </span>
          </div>
          <div className="space-y-0.5 pl-5">
            {triggers.map((t, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Search className="h-2.5 w-2.5 shrink-0" />
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Body */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Wrench className="h-3 w-3 text-muted-foreground" />
          <span className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
            Agent Definition
          </span>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={cn(
            'w-full min-h-[200px] resize-y rounded border border-border bg-surface p-3',
            'font-mono text-xs text-foreground leading-relaxed',
            'outline-none focus:border-accent-blue/50 transition-colors',
          )}
          spellCheck={false}
        />
      </div>
    </div>
  );
}
