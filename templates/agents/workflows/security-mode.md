---
name: security-mode
description: Auto-triggered for security-sensitive changes. Runs Attacker agent before AND after implementation.
tokens: ~2K
load-when: Auto-triggered for security-sensitive changes
last-verified: 2026-01-11
---

# Security Mode Workflow

## When Active

**Auto-triggered for:**
- New API endpoints
- Authentication/authorization changes
- Encryption or secret handling
- Resource access operations
- User input handling
- Multi-tenant data access

**Cannot be bypassed or downgraded.**

---

## Workflow Steps

### Phase 1: Pre-Implementation Security Review (Required Depth)

Before writing ANY code, 🗡️ Attacker MUST complete this analysis:

```
┌─────────────────────────────────────────────────────────────┐
│ 🔐 SECURITY MODE - Pre-Implementation Review                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 🗡️ Attacker analyzing planned changes...                    │
│                                                             │
│ ═══════════════════════════════════════════════════════════ │
│                                                             │
│ ATTACK SURFACE IDENTIFICATION:                             │
│                                                             │
│ Endpoints/Functions affected:                              │
│ - [endpoint/function 1]                                    │
│ - [endpoint/function 2]                                    │
│                                                             │
│ ═══════════════════════════════════════════════════════════ │
│                                                             │
│ USER INPUT ANALYSIS:                                       │
│                                                             │
│ | Input | Source | Type | Validation Needed |              │
│ |-------|--------|------|-------------------|              │
│ | resourceId | URL param | string | UUID format, ownership |│
│ | limit | body | number | Range 1-1000 |                   │
│                                                             │
│ ═══════════════════════════════════════════════════════════ │
│                                                             │
│ AUTHORIZATION ANALYSIS:                                    │
│                                                             │
│ Resource ownership verification:                           │
│ - How is user identity established? [JWT/session/etc]     │
│ - How is resource ownership verified? [DB check/etc]      │
│ - What happens if verification is skipped? [impact]       │
│                                                             │
│ ═══════════════════════════════════════════════════════════ │
│                                                             │
│ POTENTIAL ABUSE SCENARIOS:                                 │
│                                                             │
│ 1. [Abuse scenario 1]                                      │
│    Attack: [How attacker exploits this]                   │
│    Impact: [What they gain]                               │
│    Prevention: [Required check]                           │
│                                                             │
│ 2. [Abuse scenario 2]                                      │
│    Attack: [How attacker exploits this]                   │
│    Impact: [What they gain]                               │
│    Prevention: [Required check]                           │
│                                                             │
│ ═══════════════════════════════════════════════════════════ │
│                                                             │
│ SECURITY REQUIREMENTS (Must implement):                    │
│                                                             │
│ □ [Specific requirement 1]                                 │
│ □ [Specific requirement 2]                                 │
│ □ [Specific requirement 3]                                 │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│                                                             │
│ Pre-implementation review COMPLETE.                        │
│ Proceed with implementation using these requirements.      │
│                                                             │
│ ⚠️ If any section above is unclear or incomplete:          │
│ → Clarify design before implementing                       │
└─────────────────────────────────────────────────────────────┘
```

**Minimum requirements for Phase 1:**
- At least 1 endpoint/function identified
- All user inputs listed with validation needs
- Authorization flow documented
- At least 2 abuse scenarios imagined
- At least 2 security requirements specified

**If these minimums cannot be met, the design is too vague → clarify before proceeding.**

### Phase 2: Implementation

Implement following security requirements from Phase 1.

For each security requirement:
```
□ Requirement implemented
□ Test written to verify
□ Negative test (attack blocked)
```

### Phase 3: Post-Implementation Security Audit

After code is written, 🗡️ Attacker performs full audit:

```
┌─────────────────────────────────────────────────────────────┐
│ 🔐 SECURITY MODE - Post-Implementation Audit                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 🗡️ Attacker reviewing implementation...                     │
│                                                             │
│ FILES REVIEWED:                                            │
│ - [list of files]                                          │
│                                                             │
│ SECURITY REQUIREMENTS VERIFICATION:                        │
│                                                             │
│ From Pre-Implementation:                                   │
│ ✅ Requirement 1: [How it was implemented]                 │
│ ✅ Requirement 2: [How it was implemented]                 │
│ 🚫 Requirement 3: [NOT IMPLEMENTED - must fix]             │
│                                                             │
│ ADDITIONAL CHECKS:                                         │
│                                                             │
│ ✅ Authentication: @requireAuth present                     │
│ ✅ Authorization: Ownership check on line 45               │
│ ⚠️ Input validation: Missing max length on field X        │
│ ✅ Error handling: No sensitive data leaked                │
│ ✅ Logging: No secrets in logs                             │
│                                                             │
│ ISSUES TO FIX:                                             │
│ - [Issue 1]: [specific fix needed]                         │
│ - [Issue 2]: [specific fix needed]                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Phase 4: Fix Security Issues

Any issues found in Phase 3 must be fixed. No exceptions.

### Phase 5: Re-Audit

If fixes were made, 🗡️ Attacker re-audits the fixes:

```
┌─────────────────────────────────────────────────────────────┐
│ 🔐 SECURITY MODE - Fix Verification                         │
│                                                             │
│ Changes reviewed:                                          │
│ - [fix 1]: ✅ Correctly implemented                        │
│ - [fix 2]: ✅ Correctly implemented                        │
│                                                             │
│ No new issues introduced: ✅                                │
│                                                             │
│ Security review PASSED.                                    │
└─────────────────────────────────────────────────────────────┘
```

### Phase 6: Quality Gate + Post-Review Ritual

```
┌─────────────────────────────────────────────────────────────┐
│ 📋 RULES ENFORCER - Pre-Commit Check                        │
│                                                             │
│ ✅ All rules passed                                         │
│                                                             │
│ Ready to commit.                                           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 🔄 POST-REVIEW RITUAL                                       │
│                                                             │
│ □ New security pattern discovered? → Add to 🗡️ Attacker    │
│ □ New attack vector for this codebase? → Add to Known     │
│ □ Test gaps for security scenarios? → Note or write tests │
│                                                             │
│ Ritual complete? → Commit                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Security Review Checklist

### New Endpoint
```
□ @requireAuth middleware applied
□ User ownership verified (not just authenticated)
□ All parameters validated (type, length, range, pattern)
□ Rate limiting applied
□ Error responses don't leak internals
□ Audit logging for sensitive actions
□ Tested with other user's resource IDs (should fail)
```

### Resource Operation
```
□ User can only access their own resources
□ Secrets never logged
□ Encryption used correctly
□ State changes are atomic
□ Lock/unlock pattern correct
```

### User Input
```
□ Type validation
□ Length limits
□ Range validation (min/max)
□ Pattern validation (UUID, format checks)
□ Sanitization if rendered
□ No SQL injection (using parameterized queries)
```

---

## Cannot Bypass

Even if you think a security change is "trivial":
- Security mode STILL activates
- Both pre AND post reviews STILL run
- All issues MUST be fixed
- Post-review ritual MUST complete

No exceptions.

---

## Example

```
USER: "Add new endpoint to get resource details"

SYSTEM:
┌─────────────────────────────────────────────────────────────┐
│ SECURITY MODE ACTIVATED                                     │
│                                                             │
│ Reason: New API endpoint                                   │
│                                                             │
│ Attacker will review BEFORE and AFTER implementation       │
└─────────────────────────────────────────────────────────────┘

[Phase 1: Pre-implementation review with required depth]
  - Attack surface: GET /resources/:resourceId/details
  - User inputs: resourceId (UUID)
  - Authorization: Must verify user owns resource
  - Abuse scenarios:
    1. User A queries User B's resource (IDOR)
    2. Enumerate resource IDs to find active ones
  - Security requirements:
    □ Verify req.user.id === resource.user_id
    □ Rate limit to prevent enumeration

[Phase 2: Implementation with requirements]
[Phase 3: Post-implementation audit]
[Phase 4: Fix any issues]
[Phase 5: Verify fixes]
[Phase 6: Rules enforcer + Post-review ritual]
[Commit]
```

---

## Related

- [full-mode.md](./full-mode.md) - Standard workflow
- [../red-team/attacker.md](../red-team/attacker.md) - Attacker agent spec
- [../QUICK-REFERENCE.md](../QUICK-REFERENCE.md) - One-page overview
