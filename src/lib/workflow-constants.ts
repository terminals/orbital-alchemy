import { Shield, ShieldCheck, AlertTriangle, Cog, Eye } from 'lucide-react';
import type { HookCategory, HookEnforcement } from '../../shared/workflow-config';

// ─── Enforcement Colors (hex) ───────────────────────────────

export const ENFORCEMENT_HEX: Record<HookEnforcement, string> = {
  blocker: '#ef4444',
  advisor: '#f59e0b',
  operator: '#3b82f6',
  silent: '#6b7280',
};

// ─── Enforcement Colors (Tailwind classes for badges) ───────

export const ENFORCEMENT_CLASSES: Record<string, string> = {
  blocker: 'text-red-400 bg-red-500/10 border-red-500/20',
  advisor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  operator: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  silent: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
};

// ─── Enforcement descriptions ───────────────────────────────

export const ENFORCEMENT_DESCRIPTIONS: Record<HookEnforcement, string> = {
  blocker: 'Blocks transition on failure',
  advisor: 'Warns but allows transition',
  operator: 'Side-effects during lifecycle',
  silent: 'Observes without affecting outcome',
};

// ─── Hook Category Config ───────────────────────────────────

export const CATEGORY_CONFIG: Record<HookCategory, { icon: typeof Shield; color: string; label: string }> = {
  guard: { icon: ShieldCheck, color: '#ef4444', label: 'Guards' },
  gate: { icon: AlertTriangle, color: '#f59e0b', label: 'Gates' },
  lifecycle: { icon: Cog, color: '#3b82f6', label: 'Lifecycle' },
  observer: { icon: Eye, color: '#6b7280', label: 'Observers' },
};

// ─── Category Colors (hex only) ─────────────────────────────

export const CATEGORY_HEX: Record<string, string> = {
  guard: '#ef4444',
  gate: '#f59e0b',
  lifecycle: '#06b6d4',
  observer: '#71717a',
};
