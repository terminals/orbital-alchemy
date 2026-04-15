import { describe, it, expect } from 'vitest';
import { buildClaudeFlags, buildEnvVarPrefix } from './flag-builder.js';
import type { DispatchFlags } from '../../shared/api-types.js';
import { DEFAULT_DISPATCH_FLAGS } from '../../shared/api-types.js';

// ─── buildClaudeFlags() ──────────────────────────────────────

describe('buildClaudeFlags', () => {
  function flags(overrides: Partial<DispatchFlags> = {}): DispatchFlags {
    return { ...DEFAULT_DISPATCH_FLAGS, ...overrides };
  }

  it('generates --dangerously-skip-permissions for bypass mode', () => {
    const result = buildClaudeFlags(flags({ permissionMode: 'bypass' }));
    expect(result).toContain('--dangerously-skip-permissions');
  });

  it('generates --permission-mode for non-default non-bypass modes', () => {
    const result = buildClaudeFlags(flags({ permissionMode: 'plan' }));
    expect(result).toContain('--permission-mode plan');
    expect(result).not.toContain('--dangerously-skip-permissions');
  });

  it('generates no permission flag for default mode', () => {
    const result = buildClaudeFlags(flags({ permissionMode: 'default' }));
    expect(result).not.toContain('--permission-mode');
    expect(result).not.toContain('--dangerously-skip-permissions');
  });

  it('adds --verbose flag', () => {
    const result = buildClaudeFlags(flags({ verbose: true }));
    expect(result).toContain('--verbose');
  });

  it('omits --verbose when false', () => {
    const result = buildClaudeFlags(flags({ verbose: false }));
    expect(result).not.toContain('--verbose');
  });

  it('adds --no-markdown flag', () => {
    const result = buildClaudeFlags(flags({ noMarkdown: true }));
    expect(result).toContain('--no-markdown');
  });

  it('adds -p flag for print mode', () => {
    const result = buildClaudeFlags(flags({ printMode: true }));
    expect(result).toContain('-p');
  });

  it('adds --output-format for valid formats', () => {
    const result = buildClaudeFlags(flags({ outputFormat: 'json' }));
    expect(result).toContain('--output-format json');
  });

  it('omits --output-format for empty string', () => {
    const result = buildClaudeFlags(flags({ outputFormat: '' }));
    expect(result).not.toContain('--output-format');
  });

  it('generates --allowedTools with valid tool names', () => {
    const result = buildClaudeFlags(flags({ allowedTools: ['Read', 'Write', 'Bash'] }));
    expect(result).toContain('--allowedTools Read,Write,Bash');
  });

  it('filters out invalid tool names', () => {
    const result = buildClaudeFlags(flags({ allowedTools: ['Read', 'evil;command', 'Write'] }));
    expect(result).toContain('--allowedTools Read,Write');
    expect(result).not.toContain('evil');
  });

  it('omits --allowedTools when empty', () => {
    const result = buildClaudeFlags(flags({ allowedTools: [] }));
    expect(result).not.toContain('--allowedTools');
  });

  it('generates --disallowedTools', () => {
    const result = buildClaudeFlags(flags({ disallowedTools: ['Bash'] }));
    expect(result).toContain('--disallowedTools Bash');
  });

  it('adds --append-system-prompt with sanitized content', () => {
    const result = buildClaudeFlags(flags({ appendSystemPrompt: "Don't stop" }));
    expect(result).toContain('--append-system-prompt');
  });

  it('replaces newlines in appendSystemPrompt', () => {
    const result = buildClaudeFlags(flags({ appendSystemPrompt: 'line1\nline2' }));
    expect(result).toContain('line1\\nline2');
  });

  it('produces minimal flags for default config', () => {
    // Default flags: bypass + verbose
    const result = buildClaudeFlags(DEFAULT_DISPATCH_FLAGS);
    expect(result).toContain('--dangerously-skip-permissions');
    expect(result).toContain('--verbose');
    expect(result).not.toContain('--allowedTools');
    expect(result).not.toContain('--output-format');
  });
});

// ─── buildEnvVarPrefix() ─────────────────────────────────────

describe('buildEnvVarPrefix', () => {
  it('returns empty string for empty object', () => {
    expect(buildEnvVarPrefix({})).toBe('');
  });

  it('formats env vars as KEY=VALUE prefix', () => {
    const result = buildEnvVarPrefix({ NODE_ENV: 'test' });
    expect(result).toBe("NODE_ENV='test' ");
  });

  it('formats multiple env vars', () => {
    const result = buildEnvVarPrefix({ KEY_A: 'val1', KEY_B: 'val2' });
    expect(result).toContain("KEY_A='val1'");
    expect(result).toContain("KEY_B='val2'");
    expect(result.endsWith(' ')).toBe(true);
  });

  it('escapes single quotes in values', () => {
    const result = buildEnvVarPrefix({ MSG: "it's here" });
    expect(result).toContain("MSG='it'\\''s here'");
  });

  it('filters out invalid env var keys', () => {
    const result = buildEnvVarPrefix({ VALID_KEY: 'yes', '123invalid': 'no', 'has space': 'no' });
    expect(result).toContain('VALID_KEY');
    expect(result).not.toContain('123invalid');
    expect(result).not.toContain('has space');
  });
});
