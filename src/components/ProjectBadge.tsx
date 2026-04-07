import { useProjects } from '@/hooks/useProjectContext';

interface ProjectBadgeProps {
  projectId?: string;
  className?: string;
}

/**
 * Small colored badge showing the project name.
 * Only renders in multi-project mode and when projectId is provided.
 */
export function ProjectBadge({ projectId, className }: ProjectBadgeProps) {
  const { isMultiProject, getProjectColor, getProjectName } = useProjects();

  if (!isMultiProject || !projectId) return null;

  const color = getProjectColor(projectId);
  const name = getProjectName(projectId);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0 text-[10px] ${className ?? ''}`}
      style={{
        borderColor: `hsl(${color} / 0.4)`,
        color: `hsl(${color})`,
        borderWidth: '1px',
        borderStyle: 'solid',
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: `hsl(${color})` }}
      />
      {name}
    </span>
  );
}
