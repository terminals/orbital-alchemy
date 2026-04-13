// ─── Syntax Highlighting ─────────────────────────────────
// Pure functions for tokenizing shell, markdown, YAML, and JSON lines.

export type Lang = 'shell' | 'markdown' | 'yaml' | 'json' | 'text';

export interface Token { text: string; color?: string; bold?: boolean; italic?: boolean }

// Token colors — neon glass palette
const TC = {
  comment:  '#6B7280',  // muted gray
  keyword:  '#e91e63',  // neon pink
  string:   '#00c853',  // neon green
  number:   '#ffab00',  // amber
  variable: '#40c4ff',  // cyan
  heading:  '#00bcd4',  // neon cyan
  bold:     '#e0e0e0',  // bright foreground
  italic:   '#b0b0b0',  // slightly dimmer
  operator: '#e91e63',  // pink
  key:      '#40c4ff',  // cyan
  builtin:  '#536dfe',  // indigo
  link:     '#8B5CF6',  // purple
  punctuation: '#6B7280',
} as const;

export function detectLang(filePath: string | null): Lang {
  if (!filePath) return 'text';
  if (filePath.endsWith('.sh')) return 'shell';
  if (filePath.endsWith('.md')) return 'markdown';
  if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) return 'yaml';
  if (filePath.endsWith('.json') || filePath.endsWith('.jsonc')) return 'json';
  return 'text';
}

export function highlightLine(line: string, lang: Lang): Token[] {
  if (lang === 'text') return [{ text: line }];
  if (lang === 'shell') return highlightShell(line);
  if (lang === 'markdown') return highlightMarkdown(line);
  if (lang === 'yaml') return highlightYaml(line);
  if (lang === 'json') return highlightJson(line);
  return [{ text: line }];
}

// ─── Shell ───────────────────────────────────────────────

const SHELL_KEYWORDS = new Set([
  'if', 'then', 'else', 'elif', 'fi', 'for', 'in', 'do', 'done', 'while', 'until',
  'case', 'esac', 'function', 'return', 'exit', 'local', 'export', 'readonly',
  'source', 'set', 'unset', 'shift', 'break', 'continue', 'true', 'false',
]);

function highlightShell(line: string): Token[] {
  const tokens: Token[] = [];
  // Full-line comment
  const trimmed = line.trimStart();
  if (trimmed.startsWith('#')) {
    return [{ text: line, color: TC.comment, italic: true }];
  }

  let i = 0;
  while (i < line.length) {
    // Inline comment (preceded by whitespace)
    if (line[i] === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      tokens.push({ text: line.slice(i), color: TC.comment, italic: true });
      break;
    }
    // Double-quoted string
    if (line[i] === '"') {
      const end = findClosingQuote(line, i, '"');
      tokens.push({ text: line.slice(i, end), color: TC.string });
      i = end;
      continue;
    }
    // Single-quoted string
    if (line[i] === "'") {
      const end = findClosingQuote(line, i, "'");
      tokens.push({ text: line.slice(i, end), color: TC.string });
      i = end;
      continue;
    }
    // Variable $VAR or ${VAR}
    if (line[i] === '$') {
      if (line[i + 1] === '{') {
        const close = line.indexOf('}', i + 2);
        const end = close === -1 ? line.length : close + 1;
        tokens.push({ text: line.slice(i, end), color: TC.variable });
        i = end;
      } else if (line[i + 1] === '(') {
        tokens.push({ text: '$(', color: TC.variable });
        i += 2;
      } else {
        const m = line.slice(i).match(/^\$[A-Za-z_]\w*/);
        if (m) {
          tokens.push({ text: m[0], color: TC.variable });
          i += m[0].length;
        } else {
          tokens.push({ text: '$', color: TC.variable });
          i++;
        }
      }
      continue;
    }
    // Operators
    if ('|&;><'.includes(line[i])) {
      let op = line[i];
      if (i + 1 < line.length && (line.slice(i, i + 2) === '||' || line.slice(i, i + 2) === '&&' || line.slice(i, i + 2) === '>>' || line.slice(i, i + 2) === '<<')) {
        op = line.slice(i, i + 2);
      }
      tokens.push({ text: op, color: TC.operator });
      i += op.length;
      continue;
    }
    // Word (keyword or plain)
    const wordMatch = line.slice(i).match(/^[A-Za-z_]\w*/);
    if (wordMatch) {
      const w = wordMatch[0];
      if (SHELL_KEYWORDS.has(w)) {
        tokens.push({ text: w, color: TC.keyword, bold: true });
      } else {
        tokens.push({ text: w });
      }
      i += w.length;
      continue;
    }
    // Number
    const numMatch = line.slice(i).match(/^\d+/);
    if (numMatch) {
      tokens.push({ text: numMatch[0], color: TC.number });
      i += numMatch[0].length;
      continue;
    }
    // Default: single char
    tokens.push({ text: line[i] });
    i++;
  }
  return tokens;
}

// ─── Markdown ────────────────────────────────────────────

function highlightMarkdown(line: string): Token[] {
  const trimmed = line.trimStart();
  // Heading
  const headingMatch = trimmed.match(/^(#{1,6})\s/);
  if (headingMatch) {
    return [{ text: line, color: TC.heading, bold: true }];
  }
  // Code block fence
  if (trimmed.startsWith('```')) {
    return [{ text: line, color: TC.builtin }];
  }
  // HTML comment
  if (trimmed.startsWith('<!--')) {
    return [{ text: line, color: TC.comment, italic: true }];
  }
  // List item
  if (/^(\s*[-*+]|\s*\d+\.)\s/.test(line)) {
    const m = line.match(/^(\s*[-*+\d.]+\s)(.*)$/);
    if (m) {
      return [
        { text: m[1], color: TC.operator },
        ...highlightMarkdownInline(m[2]),
      ];
    }
  }
  return highlightMarkdownInline(line);
}

function highlightMarkdownInline(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < line.length) {
    // Inline code
    if (line[i] === '`') {
      const end = line.indexOf('`', i + 1);
      if (end !== -1) {
        tokens.push({ text: line.slice(i, end + 1), color: TC.builtin });
        i = end + 1;
        continue;
      }
    }
    // Bold **text**
    if (line.slice(i, i + 2) === '**') {
      const end = line.indexOf('**', i + 2);
      if (end !== -1) {
        tokens.push({ text: line.slice(i, end + 2), color: TC.bold, bold: true });
        i = end + 2;
        continue;
      }
    }
    // Link [text](url)
    if (line[i] === '[') {
      const m = line.slice(i).match(/^\[([^\]]*)\]\(([^)]*)\)/);
      if (m) {
        tokens.push({ text: `[${m[1]}]`, color: TC.heading });
        tokens.push({ text: `(${m[2]})`, color: TC.link });
        i += m[0].length;
        continue;
      }
    }
    tokens.push({ text: line[i] });
    i++;
  }
  return tokens;
}

// ─── YAML ────────────────────────────────────────────────

function highlightYaml(line: string): Token[] {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('#')) {
    return [{ text: line, color: TC.comment, italic: true }];
  }
  // Key: value
  const kvMatch = line.match(/^(\s*)([\w.-]+)(:)(.*)/);
  if (kvMatch) {
    const tokens: Token[] = [
      { text: kvMatch[1] },
      { text: kvMatch[2], color: TC.key },
      { text: kvMatch[3], color: TC.punctuation },
    ];
    const val = kvMatch[4];
    if (val) tokens.push(...highlightYamlValue(val));
    return tokens;
  }
  // List item
  if (/^\s*-\s/.test(line)) {
    const m = line.match(/^(\s*-\s)(.*)/);
    if (m) {
      return [{ text: m[1], color: TC.operator }, ...highlightYamlValue(m[2])];
    }
  }
  return [{ text: line }];
}

function highlightYamlValue(val: string): Token[] {
  const trimmed = val.trim();
  if (!trimmed) return [{ text: val }];
  if (/^["']/.test(trimmed)) return [{ text: val, color: TC.string }];
  if (/^(true|false|null|yes|no)$/i.test(trimmed)) return [{ text: val, color: TC.keyword }];
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return [{ text: val, color: TC.number }];
  if (trimmed.startsWith('#')) return [{ text: val, color: TC.comment, italic: true }];
  // Check for inline comment after value
  const commentIdx = val.indexOf(' #');
  if (commentIdx !== -1) {
    return [
      { text: val.slice(0, commentIdx) },
      { text: val.slice(commentIdx), color: TC.comment, italic: true },
    ];
  }
  return [{ text: val, color: TC.string }];
}

// ─── JSON ────────────────────────────────────────────────

function highlightJson(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < line.length) {
    // String (key or value)
    if (line[i] === '"') {
      const end = findClosingQuote(line, i, '"');
      const str = line.slice(i, end);
      // Check if this is a key (followed by :)
      const after = line.slice(end).trimStart();
      const color = after.startsWith(':') ? TC.key : TC.string;
      tokens.push({ text: str, color });
      i = end;
      continue;
    }
    // Numbers
    const numMatch = line.slice(i).match(/^-?\d+(\.\d+)?([eE][+-]?\d+)?/);
    if (numMatch) {
      tokens.push({ text: numMatch[0], color: TC.number });
      i += numMatch[0].length;
      continue;
    }
    // Booleans and null
    const kwMatch = line.slice(i).match(/^(true|false|null)\b/);
    if (kwMatch) {
      tokens.push({ text: kwMatch[0], color: TC.keyword });
      i += kwMatch[0].length;
      continue;
    }
    // Punctuation
    if ('{}[]:,'.includes(line[i])) {
      tokens.push({ text: line[i], color: TC.punctuation });
      i++;
      continue;
    }
    tokens.push({ text: line[i] });
    i++;
  }
  return tokens;
}

// ─── Helpers ─────────────────────────────────────────────

function findClosingQuote(line: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < line.length) {
    if (line[i] === '\\') { i += 2; continue; }
    if (line[i] === quote) return i + 1;
    i++;
  }
  return line.length;
}
