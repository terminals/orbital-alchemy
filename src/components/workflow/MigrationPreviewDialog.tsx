import { useState, useMemo, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, AlertTriangle, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import type { WorkflowConfig } from '../../../shared/workflow-config';

// ─── Types ──────────────────────────────────────────────

interface MigrationPlan {
  valid: boolean;
  validationErrors: string[];
  removedLists: string[];
  addedLists: string[];
  orphanedScopes: Array<{ listId: string; scopeFiles: string[] }>;
  lostEdges: Array<{ from: string; to: string }>;
  suggestedMappings: Record<string, string>;
  impactSummary: string;
}

interface MigrationPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: WorkflowConfig;
  plan: MigrationPlan | null;
  loading: boolean;
  error: string | null;
  onApply: (orphanMappings: Record<string, string>) => void;
}

// ─── Component ──────────────────────────────────────────

export function MigrationPreviewDialog({
  open,
  onOpenChange,
  config,
  plan,
  loading,
  error,
  onApply,
}: MigrationPreviewDialogProps) {
  const [orphanMappings, setOrphanMappings] = useState<Record<string, string>>({});

  // Initialize mappings from suggestions when plan changes
  useMemo(() => {
    if (plan?.suggestedMappings) {
      setOrphanMappings({ ...plan.suggestedMappings });
    }
  }, [plan?.suggestedMappings]);

  const listIds = useMemo(() => config.lists.map((l) => l.id), [config.lists]);

  const allOrphansMapped = useMemo(() => {
    if (!plan) return true;
    return plan.orphanedScopes.every((o) => orphanMappings[o.listId]);
  }, [plan, orphanMappings]);

  const handleApply = useCallback(() => {
    if (!allOrphansMapped) return;
    onApply(orphanMappings);
  }, [allOrphansMapped, orphanMappings, onApply]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[80vh] w-[520px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
            <Dialog.Title className="flex items-center gap-2 text-sm font-medium text-zinc-100">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Migration Preview
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="max-h-[60vh] overflow-y-auto p-5 text-xs">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-8 text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Computing migration impact...</span>
              </div>
            )}

            {error && (
              <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-red-400">
                {error}
              </div>
            )}

            {plan && !loading && (
              <div className="space-y-4">
                {/* Validation errors */}
                {!plan.valid && (
                  <div className="rounded border border-red-500/30 bg-red-500/10 p-3">
                    <p className="mb-2 font-semibold text-red-400">Validation Errors</p>
                    {plan.validationErrors.map((e) => (
                      <p key={e} className="text-red-400">{e}</p>
                    ))}
                  </div>
                )}

                {plan.valid && (
                  <>
                    {/* Summary */}
                    <div className="rounded border border-zinc-800 bg-zinc-950/50 p-3">
                      <p className="text-zinc-300">{plan.impactSummary}</p>
                    </div>

                    {/* Added lists */}
                    {plan.addedLists.length > 0 && (
                      <Section title={`Added Lists (${plan.addedLists.length})`}>
                        <div className="flex flex-wrap gap-1.5">
                          {plan.addedLists.map((id) => (
                            <span key={id} className="rounded bg-emerald-500/15 px-2 py-1 font-mono text-emerald-400">
                              + {id}
                            </span>
                          ))}
                        </div>
                      </Section>
                    )}

                    {/* Removed lists */}
                    {plan.removedLists.length > 0 && (
                      <Section title={`Removed Lists (${plan.removedLists.length})`}>
                        <div className="flex flex-wrap gap-1.5">
                          {plan.removedLists.map((id) => (
                            <span key={id} className="rounded bg-red-500/15 px-2 py-1 font-mono text-red-400">
                              - {id}
                            </span>
                          ))}
                        </div>
                      </Section>
                    )}

                    {/* Lost edges */}
                    {plan.lostEdges.length > 0 && (
                      <Section title={`Lost Edges (${plan.lostEdges.length})`}>
                        <div className="space-y-1">
                          {plan.lostEdges.map((e) => (
                            <div key={`${e.from}:${e.to}`} className="flex items-center gap-2 text-zinc-400">
                              <span className="font-mono">{e.from}</span>
                              <ArrowRight className="h-3 w-3 text-zinc-600" />
                              <span className="font-mono">{e.to}</span>
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}

                    {/* Orphaned scopes */}
                    {plan.orphanedScopes.length > 0 && (
                      <Section title="Orphaned Scopes — Reassignment Required">
                        <div className="space-y-3">
                          {plan.orphanedScopes.map((o) => (
                            <div key={o.listId} className="rounded border border-amber-500/30 bg-amber-500/5 p-3">
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-amber-400">{o.listId}</span>
                                <span className="text-zinc-500">{o.scopeFiles.length} scope(s)</span>
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                <span className="text-zinc-500">Move to:</span>
                                <select
                                  value={orphanMappings[o.listId] ?? ''}
                                  onChange={(e) => setOrphanMappings((prev) => ({ ...prev, [o.listId]: e.target.value }))}
                                  className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-zinc-200 outline-none focus:border-zinc-500"
                                >
                                  <option value="">Select destination...</option>
                                  {listIds.map((id) => (
                                    <option key={id} value={id}>{id}</option>
                                  ))}
                                </select>
                              </div>
                              {o.scopeFiles.length <= 5 && (
                                <div className="mt-2 space-y-0.5">
                                  {o.scopeFiles.map((f) => (
                                    <p key={f} className="font-mono text-[10px] text-zinc-500">{f}</p>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}

                    {/* No impact */}
                    {plan.removedLists.length === 0 &&
                      plan.addedLists.length === 0 &&
                      plan.lostEdges.length === 0 &&
                      plan.orphanedScopes.length === 0 && (
                      <div className="flex items-center gap-2 rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>No migration needed — configs are compatible</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-4">
            <Dialog.Close className="rounded px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
              Cancel
            </Dialog.Close>
            {plan?.valid && (
              <button
                onClick={handleApply}
                disabled={!allOrphansMapped}
                className="flex items-center gap-1.5 rounded bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Apply Migration
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Sub-components ─────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{title}</h4>
      {children}
    </div>
  );
}
