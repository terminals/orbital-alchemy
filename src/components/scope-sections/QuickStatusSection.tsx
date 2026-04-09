import { Badge } from '@/components/ui/badge';

interface QuickStatusSectionProps {
  content: string;
}

export function QuickStatusSection({ content }: QuickStatusSectionProps) {
  // Parse blockquote like: > ✅ **Status**: Reviewed | **Phase**: 4 of 4 | **Spec Locked**: Yes
  const line = content.replace(/^>\s*/gm, '').replace(/\n/g, ' ').trim();
  const parts = line.split('|').map(p => p.trim()).filter(Boolean);

  const badges: { label: string; value: string }[] = [];
  for (const part of parts) {
    const m = part.match(/\*\*(.+?)\*\*[:\s]*(.+)/);
    if (m) {
      badges.push({ label: m[1].trim(), value: m[2].trim() });
    }
  }

  if (badges.length === 0) {
    // Couldn't parse — render as text
    return <p className="text-xxs text-muted-foreground">{line}</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {badges.map(({ label, value }) => (
        <div key={label} className="flex items-center gap-1.5">
          <span className="text-xxs text-muted-foreground">{label}</span>
          <Badge variant="outline" className="h-5 px-1.5 text-xxs">
            {value}
          </Badge>
        </div>
      ))}
    </div>
  );
}
