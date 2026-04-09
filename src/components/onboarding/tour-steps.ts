export interface TourStep {
  /** Unique step identifier */
  id: string;
  /** data-tour attribute value used to locate the target element */
  target: string;
  /** Step title */
  title: string;
  /** Step description */
  description: string;
  /** Route to navigate to before showing this step */
  page?: string;
  /** If true, skip gracefully when the target element doesn't exist */
  optional?: boolean;
  /** Position of the popover relative to the target (default: 'right') */
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** Cap the spotlight width (px) so wide targets leave room for the popover */
  maxSpotlightWidth?: number;
}

export const TOUR_STEPS: TourStep[] = [
  // Kanban page steps
  {
    id: 'welcome',
    target: 'nav-kanban',
    title: 'Welcome to Orbital Command',
    description: 'This is your project management dashboard for Claude Code projects. Let\'s take a quick tour of what everything does.',
    page: '/',
  },
  {
    id: 'kanban-board',
    target: 'kanban-board',
    title: 'Kanban Board',
    description: 'Your scopes are organized into columns that represent workflow stages. Each column maps to a status in your workflow configuration.',
    page: '/',
    placement: 'right',
    maxSpotlightWidth: 800,
  },
  {
    id: 'kanban-column',
    target: 'kanban-column',
    title: 'Workflow Columns',
    description: 'Columns are driven by your workflow DAG — transitions between statuses are defined as edges. Drag scopes between columns to update their status.',
    page: '/',
    optional: true,
    placement: 'bottom',
  },
  {
    id: 'scope-card',
    target: 'scope-card',
    title: 'Scope Cards',
    description: 'Each card represents a scope — a unit of work with phases, success criteria, and a definition of done. Click a card to see its full details.',
    page: '/',
    optional: true,
    placement: 'bottom',
  },

  // Primitives page
  {
    id: 'nav-primitives',
    target: 'nav-primitives',
    title: 'Primitives',
    description: 'View and manage the building blocks of your project — hooks, skills, agents, and workflow presets that power your Claude Code setup.',
    page: '/primitives',
  },

  // Guards page
  {
    id: 'nav-guards',
    target: 'nav-guards',
    title: 'Guards',
    description: 'Quality gates and enforcement rules that run before transitions. Configure type checks, tests, linting, and custom validation commands.',
    page: '/guards',
  },

  // Repo page
  {
    id: 'nav-repo',
    target: 'nav-repo',
    title: 'Repo',
    description: 'Source control integration — view branches, recent commits, and GitHub connection status for your project.',
    page: '/repo',
  },

  // Sessions page
  {
    id: 'nav-sessions',
    target: 'nav-sessions',
    title: 'Sessions',
    description: 'Track Claude Code agent sessions — see what\'s running, review session history, and monitor dispatch progress in real time.',
    page: '/sessions',
  },

  // Workflow page
  {
    id: 'nav-workflow',
    target: 'nav-workflow',
    title: 'Workflow',
    description: 'The visual DAG editor for your workflow configuration. Define statuses, transitions, hooks, and event inference rules that drive the Kanban board.',
    page: '/workflow',
  },

  // Settings
  {
    id: 'nav-settings',
    target: 'nav-settings',
    title: 'Settings',
    description: 'Customize appearance, font, zoom level, and other preferences. You can restart this tour anytime from here.',
  },
];
