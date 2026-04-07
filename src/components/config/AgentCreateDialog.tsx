import { useState, useCallback } from 'react';
import { Plus, Bot, Shield, Eye, Wrench, Search, Sparkles } from 'lucide-react';
import { useProjectUrl } from '@/hooks/useProjectUrl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface AgentCreateDialogProps {
  onCreated: () => void;
}

interface Template {
  id: string;
  label: string;
  icon: typeof Shield;
  description: string;
  scaffold: string;
  defaultFolder: string;
}

const TEMPLATES: Template[] = [
  {
    id: 'security',
    label: 'Security',
    icon: Shield,
    description: 'Adversarial security review agent',
    defaultFolder: 'red-team',
    scaffold: `# {name}

{description}

## Role

You are a security-focused review agent. Your goal is to identify vulnerabilities, insecure patterns, and potential attack vectors in the code under review.

## Auto-triggered for:
- Security-sensitive file changes
- Authentication/authorization code
- Input handling and validation

## Review Checklist
- [ ] Input validation and sanitization
- [ ] Authentication/authorization checks
- [ ] Secrets and credential handling
- [ ] SQL/command injection risks
- [ ] XSS and CSRF protections
`,
  },
  {
    id: 'reliability',
    label: 'Reliability',
    icon: Eye,
    description: 'Production reliability review agent',
    defaultFolder: 'blue-team',
    scaffold: `# {name}

{description}

## Role

You are a reliability-focused review agent. Your goal is to ensure code changes are production-safe with proper error handling, observability, and graceful degradation.

## Auto-triggered for:
- Error handling changes
- Service boundary code
- Database operations

## Review Checklist
- [ ] Error handling completeness
- [ ] Timeout and retry logic
- [ ] Logging and observability
- [ ] Graceful degradation
`,
  },
  {
    id: 'domain-expert',
    label: 'Domain Expert',
    icon: Search,
    description: 'Domain-specific expertise agent',
    defaultFolder: 'green-team',
    scaffold: `# {name}

{description}

## Role

You are a domain expert review agent. Your goal is to ensure code changes correctly implement business logic and domain-specific requirements.

## Auto-triggered for:
- Business logic changes
- Domain model modifications
- API contract changes

## Review Checklist
- [ ] Business rule correctness
- [ ] Domain model integrity
- [ ] API contract compliance
`,
  },
  {
    id: 'guardian',
    label: 'Guardian',
    icon: Wrench,
    description: 'Code quality and standards agent',
    defaultFolder: 'blue-team',
    scaffold: `# {name}

{description}

## Role

You are a code quality guardian agent. Your goal is to ensure code follows project conventions, maintains consistency, and upholds quality standards.

## Auto-triggered for:
- All code changes

## Review Checklist
- [ ] Code style and conventions
- [ ] Test coverage
- [ ] Documentation completeness
- [ ] Performance implications
`,
  },
  {
    id: 'custom',
    label: 'Custom',
    icon: Sparkles,
    description: 'Start from a blank template',
    defaultFolder: '',
    scaffold: `# {name}

{description}

## Role

Describe this agent's role and responsibilities.

## Review Checklist
- [ ] Add review criteria here
`,
  },
];

export function AgentCreateDialog({ onCreated }: AgentCreateDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('security');
  const buildUrl = useProjectUrl();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [folder, setFolder] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const template = TEMPLATES.find(t => t.id === selectedTemplate) ?? TEMPLATES[0];

  const handleCreate = useCallback(async () => {
    if (!name.trim()) {
      setError('Agent name is required');
      return;
    }

    const slug = name.trim().toLowerCase().replace(/\s+/g, '-');
    const folderPath = folder.trim() || template.defaultFolder;
    const filePath = folderPath ? `${folderPath}/${slug}.md` : `${slug}.md`;

    const content = `---\nname: ${name.trim()}\ndescription: ${description.trim() || template.description}\n---\n${template.scaffold
      .replace(/\{name\}/g, name.trim())
      .replace(/\{description\}/g, description.trim() || template.description)}`;

    setCreating(true);
    setError(null);

    try {
      const res = await fetch(buildUrl('/config/agents/file'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: 'Create failed' }));
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setOpen(false);
      setName('');
      setDescription('');
      setFolder('');
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  }, [name, description, folder, template, onCreated, buildUrl]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          <Bot className="h-3.5 w-3.5" />
          New Agent
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" /> Create Agent
          </DialogTitle>
          <DialogDescription>
            Choose a template and configure your new review agent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Template selector */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Template</label>
            <div className="grid grid-cols-5 gap-1.5">
              {TEMPLATES.map(t => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSelectedTemplate(t.id);
                      setFolder(t.defaultFolder);
                    }}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-md border p-2 text-[10px] transition-colors',
                      selectedTemplate === t.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-muted-foreground/40',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., API Security Reviewer"
              className={cn(
                'w-full rounded border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground',
                'outline-none focus:border-accent-blue/50 transition-colors',
              )}
            />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={template.description}
              className={cn(
                'w-full rounded border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground',
                'outline-none focus:border-accent-blue/50 transition-colors',
              )}
            />
          </div>

          {/* Folder */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Team Folder
              <span className="ml-1 text-muted-foreground/50">(optional)</span>
            </label>
            <input
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder={template.defaultFolder || 'root'}
              className={cn(
                'w-full rounded border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground font-mono',
                'outline-none focus:border-accent-blue/50 transition-colors',
              )}
            />
            <div className="flex gap-1.5 mt-1">
              {['red-team', 'blue-team', 'green-team'].map(f => (
                <Badge
                  key={f}
                  variant={folder === f ? 'default' : 'secondary'}
                  className="text-[10px] cursor-pointer"
                  onClick={() => setFolder(f)}
                >
                  {f}
                </Badge>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating...' : 'Create Agent'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
