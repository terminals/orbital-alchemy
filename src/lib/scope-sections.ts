// ── Client-side parser: splits scope raw_content into structured sections ──

export type ScopeSectionType =
  | 'quick-status' | 'progress' | 'activity' | 'next-actions'
  | 'overview' | 'requirements' | 'approach' | 'phases'
  | 'files-summary' | 'success-criteria' | 'risks' | 'definition-of-done'
  | 'exploration' | 'decisions' | 'implementation-log' | 'deviations'
  | 'agent-review'
  | 'unknown';

export interface ScopeSection {
  id: string;
  type: ScopeSectionType;
  title: string;
  part: string;
  content: string;
  defaultCollapsed: boolean;
  meta?: SectionMeta;
}

export type SectionMeta =
  | ProgressMeta
  | ChecklistMeta
  | ReviewMeta;

export interface ProgressMeta {
  kind: 'progress';
  phases: { name: string; description: string; status: string; done: boolean }[];
  done: number;
  total: number;
}

export interface ChecklistMeta {
  kind: 'checklist';
  items: { text: string; checked: boolean }[];
  done: number;
  total: number;
}

export interface ReviewMeta {
  kind: 'review';
  blockers: number;
  warnings: number;
  suggestions: number;
  verdict?: string;
}

// ── Heading → type lookup ──

const HEADING_TYPE_MAP: Record<string, ScopeSectionType> = {
  'quick status': 'quick-status',
  'progress': 'progress',
  'recent activity': 'activity',
  'next actions': 'next-actions',
  'overview': 'overview',
  'requirements': 'requirements',
  'technical approach': 'approach',
  'implementation phases': 'phases',
  'files summary': 'files-summary',
  'success criteria': 'success-criteria',
  'risk assessment': 'risks',
  'definition of done': 'definition-of-done',
  'review status': 'agent-review',
  'synthesis': 'agent-review',
};

const DETAILS_SUMMARY_MAP: Record<string, ScopeSectionType> = {
  'exploration log': 'exploration',
  'decisions & reasoning': 'decisions',
  'decisions': 'decisions',
  'implementation log': 'implementation-log',
  'deviations from spec': 'deviations',
  'deviations': 'deviations',
};

// Part 3 and Agent Review default collapsed
const COLLAPSED_PARTS = new Set(['Process', 'Agent Review']);

// ── Delimiter regex: matches ═══ (U+2550) or === (ASCII) lines ──
const DELIMITER_RE = /^[═=]{10,}\s*$/;

// ── Part heading: ## PART N: NAME  or  ## AGENT REVIEW  or  ## NAME ──
const PART_HEADING_RE = /^##\s+(?:PART\s+\d+:\s*)?(.+)/i;

// ── Strip HTML comments ──
function stripComments(s: string): string {
  return s.replace(/<!--[\s\S]*?-->/g, '').trim();
}

// ── Parse the progress table ──
function extractProgressMeta(content: string): ProgressMeta | undefined {
  const lines = content.split('\n');
  const headerIdx = lines.findIndex(l => /\|\s*Phase\s*\|.*Description\s*\|.*Status\s*\|/i.test(l));
  if (headerIdx === -1) return undefined;

  const phases: ProgressMeta['phases'] = [];
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) break;
    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length >= 3) {
      const status = cells[2];
      phases.push({
        name: cells[0],
        description: cells[1],
        status,
        done: /✅|done|complete/i.test(status),
      });
    }
  }
  if (phases.length === 0) return undefined;
  return { kind: 'progress', phases, done: phases.filter(p => p.done).length, total: phases.length };
}

// ── Parse checklist items ──
function extractChecklistMeta(content: string): ChecklistMeta | undefined {
  const items: ChecklistMeta['items'] = [];
  for (const line of content.split('\n')) {
    const m = line.match(/^[\s]*-\s+\[([ xX])\]\s+(.*)/);
    if (m) items.push({ text: m[2].trim(), checked: m[1] !== ' ' });
  }
  if (items.length === 0) return undefined;
  return { kind: 'checklist', items, done: items.filter(i => i.checked).length, total: items.length };
}

// ── Parse agent review summary ──
function extractReviewMeta(content: string): ReviewMeta | undefined {
  let blockers = 0, warnings = 0, suggestions = 0;
  let currentSection: 'blockers' | 'warnings' | 'suggestions' | null = null;
  let verdict: string | undefined;

  for (const line of content.split('\n')) {
    const stripped = line.trim();
    if (/\*\*BLOCKERS?\*\*/i.test(stripped)) { currentSection = 'blockers'; continue; }
    if (/\*\*WARNINGS?\*\*/i.test(stripped)) { currentSection = 'warnings'; continue; }
    if (/\*\*SUGGESTIONS?\*\*/i.test(stripped)) { currentSection = 'suggestions'; continue; }
    if (/\*\*VERIFIED/i.test(stripped) || /^###/i.test(stripped)) { currentSection = null; continue; }

    if (currentSection && stripped.startsWith('- ') && !/^-\s+none/i.test(stripped)) {
      if (currentSection === 'blockers') blockers++;
      else if (currentSection === 'warnings') warnings++;
      else suggestions++;
    }

    const vm = stripped.match(/\*\*Verdict\*\*:\s*(\w+)/i);
    if (vm) verdict = vm[1];
  }
  if (blockers === 0 && warnings === 0 && suggestions === 0 && !verdict) return undefined;
  return { kind: 'review', blockers, warnings, suggestions, verdict };
}

// ── Compute meta for a section based on its type ──
function computeMeta(type: ScopeSectionType, content: string): SectionMeta | undefined {
  switch (type) {
    case 'progress':
      return extractProgressMeta(content);
    case 'requirements':
    case 'success-criteria':
    case 'definition-of-done':
    case 'next-actions':
      return extractChecklistMeta(content);
    case 'agent-review':
      return extractReviewMeta(content);
    default:
      return undefined;
  }
}

// ── Resolve heading text to ScopeSectionType ──
function resolveType(heading: string): ScopeSectionType {
  const key = heading.toLowerCase().trim();
  for (const [pattern, type] of Object.entries(HEADING_TYPE_MAP)) {
    if (key.includes(pattern)) return type;
  }
  return 'unknown';
}

// ── Parse <details> blocks from Part 3 ──
function parseDetailsBlocks(content: string, part: string): ScopeSection[] {
  const sections: ScopeSection[] = [];
  const detailsRe = /<details>\s*\n\s*<summary>(.*?)<\/summary>([\s\S]*?)<\/details>/gi;
  let match: RegExpExecArray | null;

  while ((match = detailsRe.exec(content)) !== null) {
    const summaryRaw = match[1].replace(/[📝🤔📜⚠️]/gu, '').trim();
    const body = match[2].trim();
    const key = summaryRaw.toLowerCase().trim();

    let type: ScopeSectionType = 'unknown';
    for (const [pattern, t] of Object.entries(DETAILS_SUMMARY_MAP)) {
      if (key.includes(pattern)) { type = t; break; }
    }

    sections.push({
      id: type !== 'unknown' ? type : `process-${sections.length}`,
      type,
      title: summaryRaw,
      part,
      content: body,
      defaultCollapsed: true,
      meta: computeMeta(type, body),
    });
  }

  return sections;
}

// ── Split a part's content into sections by ### headings ──
function parseSectionsFromPart(content: string, part: string): ScopeSection[] {
  const sections: ScopeSection[] = [];
  const lines = content.split('\n');
  let currentHeading: string | null = null;
  let currentLines: string[] = [];
  const isCollapsedPart = COLLAPSED_PARTS.has(part);

  function flush() {
    if (currentHeading === null) return;
    const raw = currentLines.join('\n').trim();
    if (!raw) return;
    const cleaned = stripComments(raw);
    if (!cleaned) return;

    const type = resolveType(currentHeading);
    sections.push({
      id: type !== 'unknown' ? type : `${part.toLowerCase().replace(/\s+/g, '-')}-${sections.length}`,
      type,
      title: currentHeading,
      part,
      content: cleaned,
      defaultCollapsed: isCollapsedPart,
      meta: computeMeta(type, cleaned),
    });
  }

  for (const line of lines) {
    const hm = line.match(/^###\s+(.+)/);
    if (hm) {
      flush();
      currentHeading = hm[1].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  flush();
  return sections;
}

// ── Main parser ──

export function parseScopeSections(raw: string | null | undefined): ScopeSection[] | null {
  if (!raw) return null;

  const lines = raw.split('\n');

  // Find delimiter line positions
  const delimiterPositions: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (DELIMITER_RE.test(lines[i])) delimiterPositions.push(i);
  }

  // Need at least 2 delimiter lines (one pair wrapping a part heading)
  if (delimiterPositions.length < 2) return null;

  // Group delimiters into pairs and extract parts between them
  interface RawPart { name: string; startLine: number; endLine: number }
  const parts: RawPart[] = [];

  for (let i = 0; i < delimiterPositions.length - 1; i += 2) {
    const topDelim = delimiterPositions[i];
    const bottomDelim = delimiterPositions[i + 1];

    // The part heading is between the two delimiter lines
    for (let j = topDelim + 1; j < bottomDelim; j++) {
      const hm = PART_HEADING_RE.exec(lines[j]);
      if (hm) {
        // Content starts after the bottom delimiter
        const startLine = bottomDelim + 1;
        // Content ends at the next top delimiter or EOF
        const endLine = i + 2 < delimiterPositions.length ? delimiterPositions[i + 2] : lines.length;

        let name = hm[1].trim();
        // Normalize common part names
        if (/dashboard/i.test(name)) name = 'Dashboard';
        else if (/specification/i.test(name)) name = 'Specification';
        else if (/process/i.test(name)) name = 'Process';
        else if (/agent\s*review/i.test(name)) name = 'Agent Review';

        parts.push({ name, startLine, endLine });
        break;
      }
    }
  }

  if (parts.length === 0) return null;

  const allSections: ScopeSection[] = [];

  for (const part of parts) {
    const partContent = lines.slice(part.startLine, part.endLine).join('\n');

    if (part.name === 'Process') {
      // Part 3 uses <details> blocks instead of ### headings
      const detailsSections = parseDetailsBlocks(partContent, part.name);
      if (detailsSections.length > 0) {
        allSections.push(...detailsSections);
      } else {
        // Fallback: parse by headings
        allSections.push(...parseSectionsFromPart(partContent, part.name));
      }
    } else if (part.name === 'Agent Review') {
      // Agent Review: treat entire block as one section, but also parse sub-sections
      const subSections = parseSectionsFromPart(partContent, part.name);
      if (subSections.length > 0) {
        // Merge all agent review sub-sections into one
        const merged = subSections.map(s => s.content).join('\n\n');
        const meta = extractReviewMeta(merged);
        allSections.push({
          id: 'agent-review',
          type: 'agent-review',
          title: 'Agent Review',
          part: part.name,
          content: merged,
          defaultCollapsed: true,
          meta,
        });
      }
    } else {
      allSections.push(...parseSectionsFromPart(partContent, part.name));
    }
  }

  return allSections.length > 0 ? allSections : null;
}
