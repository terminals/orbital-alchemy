import fs from 'fs';
import path from 'path';
import type { ParsedScope } from '../parsers/scope-parser.js';
import type { ScopeService } from './scope-service.js';
import type { GateService, GateRow } from './gate-service.js';
import type { WorkflowEngine } from '../../shared/workflow-engine.js';
import type { HookCategory, HookEnforcement, WorkflowEdge } from '../../shared/workflow-config.js';

// ─── Types ──────────────────────────────────────────────

export type HookReadiness = 'pass' | 'fail' | 'unknown';

export interface HookStatus {
  id: string;
  label: string;
  category: HookCategory;
  enforcement: HookEnforcement;
  status: HookReadiness;
  reason: string | null;
}

export interface TransitionReadiness {
  from: string;
  to: string;
  edge: WorkflowEdge;
  hooks: HookStatus[];
  gates: Array<{
    gate_name: string;
    status: string;
    details: string | null;
    duration_ms: number | null;
    run_at: string;
  }>;
  ready: boolean;
  blockers: string[];
}

export interface ScopeReadiness {
  scope_id: number;
  current_status: string;
  transitions: TransitionReadiness[];
}

// ─── ReadinessService ───────────────────────────────────

export class ReadinessService {
  constructor(
    private scopeService: ScopeService,
    private gateService: GateService,
    private engine: WorkflowEngine,
    private projectRoot: string,
  ) {}

  getReadiness(scopeId: number): ScopeReadiness | null {
    const scope = this.scopeService.getById(scopeId);
    if (!scope) return null;

    const targets = this.engine.getValidTargets(scope.status);
    const transitions: TransitionReadiness[] = [];

    for (const to of targets) {
      const edge = this.engine.findEdge(scope.status, to);
      if (!edge) continue;

      // Only show forward and shortcut transitions (not backward)
      if (edge.direction === 'backward') continue;

      const hooks = this.evaluateHooks(scope, edge);
      const gates = this.getGatesForScope(scopeId);
      const blockers = this.computeBlockers(hooks, scope);

      transitions.push({
        from: scope.status,
        to,
        edge,
        hooks,
        gates,
        ready: blockers.length === 0,
        blockers,
      });
    }

    return {
      scope_id: scopeId,
      current_status: scope.status,
      transitions,
    };
  }

  private evaluateHooks(scope: ParsedScope, edge: WorkflowEdge): HookStatus[] {
    const hooks = this.engine.getHooksForEdge(edge.from, edge.to);
    return hooks.map((hook) => {
      const enforcement = this.engine.getHookEnforcement(hook);
      const { status, reason } = this.evaluateHook(hook.id, scope, edge);
      return {
        id: hook.id,
        label: hook.label,
        category: hook.category,
        enforcement,
        status,
        reason,
      };
    });
  }

  private evaluateHook(
    hookId: string,
    scope: ParsedScope,
    edge: WorkflowEdge,
  ): { status: HookReadiness; reason: string | null } {
    switch (hookId) {
      case 'session-enforcer':
        return this.checkSessionEnforcer(scope, edge);
      case 'review-gate-check':
        return this.checkReviewGate(scope);
      case 'completion-checklist':
        return this.checkCompletionChecklist(scope);
      case 'blocker-check':
        return this.checkBlockers(scope);
      case 'dependency-check':
        return this.checkDependencies(scope);
      case 'scope-create-gate':
        return this.checkScopeStructure(scope);
      case 'scope-transition':
        return { status: 'pass', reason: 'Lifecycle hook (runs on transition)' };
      case 'orbital-scope-update':
      case 'scope-commit-logger':
        return { status: 'pass', reason: 'Observer (post-transition)' };
      default:
        return { status: 'unknown', reason: 'No pre-check available' };
    }
  }

  private checkSessionEnforcer(
    scope: ParsedScope,
    edge: WorkflowEdge,
  ): { status: HookReadiness; reason: string | null } {
    const targetList = this.engine.getList(edge.to);
    const sessionKey = targetList?.sessionKey;
    if (!sessionKey) return { status: 'pass', reason: 'No session key required' };

    const sessions = scope.sessions ?? {};
    const recorded = sessions[sessionKey];
    if (Array.isArray(recorded) && recorded.length > 0) {
      return { status: 'pass', reason: `Session recorded (${recorded.length} session(s))` };
    }
    return { status: 'fail', reason: `No '${sessionKey}' session recorded in scope frontmatter` };
  }

  private checkReviewGate(scope: ParsedScope): { status: HookReadiness; reason: string | null } {
    const paddedId = String(scope.id).padStart(3, '0');
    const verdictPath = path.join(this.projectRoot, '.claude', 'review-verdicts', `${paddedId}.json`);

    if (!fs.existsSync(verdictPath)) {
      return { status: 'fail', reason: 'No review verdict file found' };
    }

    try {
      const verdict = JSON.parse(fs.readFileSync(verdictPath, 'utf-8'));
      if (verdict.verdict === 'PASS') {
        return { status: 'pass', reason: 'Review verdict: PASS' };
      }
      return { status: 'fail', reason: `Review verdict: ${verdict.verdict ?? 'unknown'}` };
    } catch {
      return { status: 'fail', reason: 'Failed to parse review verdict file' };
    }
  }

  private checkCompletionChecklist(scope: ParsedScope): { status: HookReadiness; reason: string | null } {
    const content = scope.raw_content ?? '';
    const unchecked = (content.match(/^- \[ \]/gm) ?? []).length;
    const checked = (content.match(/^- \[x\]/gim) ?? []).length;

    if (checked + unchecked === 0) {
      return { status: 'unknown', reason: 'No checklist items found in scope' };
    }
    if (unchecked > 0) {
      return { status: 'fail', reason: `${unchecked} unchecked item(s) in DoD checklist` };
    }
    return { status: 'pass', reason: `All ${checked} checklist item(s) complete` };
  }

  private checkBlockers(scope: ParsedScope): { status: HookReadiness; reason: string | null } {
    const blockedBy = scope.blocked_by ?? [];
    if (blockedBy.length === 0) {
      return { status: 'pass', reason: 'No blockers' };
    }

    const unresolved: number[] = [];
    for (const blockerId of blockedBy) {
      const blocker = this.scopeService.getById(blockerId);
      if (blocker && !this.engine.isTerminalStatus(blocker.status)) {
        unresolved.push(blockerId);
      }
    }

    if (unresolved.length === 0) {
      return { status: 'pass', reason: `All ${blockedBy.length} blocker(s) resolved` };
    }
    return {
      status: 'fail',
      reason: `Blocked by unresolved scope(s): ${unresolved.join(', ')}`,
    };
  }

  private checkDependencies(scope: ParsedScope): { status: HookReadiness; reason: string | null } {
    // Same check as blockers — dependency-check and blocker-check serve similar roles
    return this.checkBlockers(scope);
  }

  private checkScopeStructure(scope: ParsedScope): { status: HookReadiness; reason: string | null } {
    if (!scope.title || scope.title.trim() === '') {
      return { status: 'fail', reason: 'Scope has no title' };
    }
    if (!scope.raw_content || scope.raw_content.trim() === '') {
      return { status: 'fail', reason: 'Scope has no content body' };
    }
    return { status: 'pass', reason: 'Scope structure valid' };
  }

  private getGatesForScope(scopeId: number): GateRow[] {
    const scoped = this.gateService.getLatestForScope(scopeId);
    if (scoped.length > 0) return scoped;

    // Fall back to global latest run if no scope-specific gates exist
    return this.gateService.getLatestRun();
  }

  private computeBlockers(hooks: HookStatus[], scope: ParsedScope): string[] {
    const blockers: string[] = [];

    // Only guards (blockers) actually prevent transitions
    for (const hook of hooks) {
      if (hook.enforcement === 'blocker' && hook.status === 'fail') {
        blockers.push(`${hook.label}: ${hook.reason}`);
      }
    }

    // Check for unresolved scope blockers
    const blockedBy = scope.blocked_by ?? [];
    for (const blockerId of blockedBy) {
      const blocker = this.scopeService.getById(blockerId);
      if (blocker && !this.engine.isTerminalStatus(blocker.status)) {
        blockers.push(`Blocked by scope ${blockerId} (${blocker.status})`);
      }
    }

    return blockers;
  }
}
