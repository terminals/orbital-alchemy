import { MarkdownSection } from './MarkdownSection';

interface TableSectionProps {
  content: string;
}

export function TableSection({ content }: TableSectionProps) {
  // Parse markdown table into structured data
  const lines = content.split('\n').filter(l => l.trim().startsWith('|'));
  if (lines.length < 2) return <MarkdownSection content={content} />;

  const parseRow = (line: string) =>
    line.split('|').map(c => c.trim()).filter(Boolean);

  const headers = parseRow(lines[0]);
  // Skip separator line (line[1])
  const rows = lines.slice(2).map(parseRow);

  if (headers.length === 0) return <MarkdownSection content={content} />;

  // Check if there's content outside the table
  const nonTableContent = content.split('\n').filter(l => !l.trim().startsWith('|')).join('\n').trim();

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-xxs">
          <thead>
            <tr className="border-b border-border/50">
              {headers.map((h, i) => (
                <th key={i} className="px-2 py-1.5 text-left text-xxs font-medium uppercase tracking-wide text-muted-foreground/70">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="border-b border-border/20">
                {headers.map((_, ci) => (
                  <td key={ci} className="px-2 py-1.5 text-foreground/70">
                    {ci === 0 && row[ci]?.startsWith('`') ? (
                      <code className="rounded bg-muted px-1 py-0.5 text-xxs font-mono">{row[ci]?.replace(/`/g, '') ?? ''}</code>
                    ) : (
                      row[ci] ?? ''
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nonTableContent && <MarkdownSection content={nonTableContent} />}
    </div>
  );
}
