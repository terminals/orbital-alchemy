import { MarkdownRenderer } from '@/components/MarkdownRenderer';

interface MarkdownSectionProps {
  content: string;
}

export function MarkdownSection({ content }: MarkdownSectionProps) {
  return <MarkdownRenderer content={content} className="section-markdown" />;
}
