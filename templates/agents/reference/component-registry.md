---
name: component-registry
description: Registry of frontend components. Loaded during Frontend Designer agent reviews.
tokens: ~0.5K
load-when: Frontend Designer agent reviews
source: frontend/src/components/
---

# Frontend Component Registry

## Purpose

Before creating ANY new component, check this registry. Avoid duplication.

---

## Existing Components

### Layout Components

| Component | Location | Props | Use For |
|-----------|----------|-------|---------|
| *(add components here)* | | | |

### Form Components

| Component | Location | Props | Use For |
|-----------|----------|-------|---------|
| *(add components here)* | | | |

### Feedback Components

| Component | Location | Props | Use For |
|-----------|----------|-------|---------|
| *(add components here)* | | | |

### Data Display

| Component | Location | Props | Use For |
|-----------|----------|-------|---------|
| *(add components here)* | | | |

### Domain-Specific

| Component | Location | Props | Use For |
|-----------|----------|-------|---------|
| *(add components here)* | | | |

---

## When to Create New vs Extend Existing

### Create New Component When:
- Functionality is truly unique
- Would require >3 new props to extend existing
- Different enough to confuse future developers

### Extend Existing Component When:
- Adding a new variant of existing (new button style)
- Adding optional behavior (sortable table)
- Composing existing components

### Check Before Creating:
1. Search this registry
2. Search `frontend/src/components/`
3. Ask: "Is this just a variant of something existing?"

---

## Updating This Registry

When adding a new component:
1. Add it to appropriate section above
2. Document all props
3. Add usage example if non-obvious
4. Note if it replaces/deprecates existing component

---

## Related

- [../blue-team/frontend-designer.md](../blue-team/frontend-designer.md) - Frontend Designer agent
