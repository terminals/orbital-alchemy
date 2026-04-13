# Prompt Library

Tested, refined prompts for common high-stakes tasks. Each prompt encodes lessons learned from real sessions — the framing, constraints, and structure that produce the best results.

## How to Use

Copy the prompt and paste it at the start of a new Claude Code session. Adjust the bracketed `[placeholders]` to your context.

## Available Prompts

| Prompt | When to Use |
|--------|-------------|
| [deep-dive-audit.md](./deep-dive-audit.md) | Pre-launch codebase health review, major refactoring, tech debt assessment |

## Prompt Design Principles

These prompts are optimized for Claude Code sessions. Key patterns:

1. **Explicit permission to be thorough** — override the default pressure to be fast
2. **Scope boundary upfront** — tell it whether analysis only or implementation included
3. **Verification requirement built in** — don't add this as an afterthought
4. **Output format defined** — what "done" looks like
5. **Resource permission** — explicitly allow parallel agents, long context, high token usage
