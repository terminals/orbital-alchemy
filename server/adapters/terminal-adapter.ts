/**
 * Terminal adapter interface for cross-platform session launching.
 * Implementations handle the specifics of opening new terminal windows/tabs.
 */
export interface TerminalAdapter {
  /** Launch a command in a new terminal window/process */
  launch(command: string, opts?: LaunchOptions): Promise<void>;

  /** Launch a command in a categorized window (tabs grouped by category) */
  launchCategorized(command: string, fullCmd: string, opts?: CategorizedLaunchOptions): Promise<void>;

  /** Set up any required profiles/configuration (e.g., iTerm2 dynamic profiles) */
  ensureProfiles?(): Promise<void>;
}

export interface LaunchOptions {
  name?: string;
}

export interface CategorizedLaunchOptions {
  tabName?: string | null;
}

export type WindowCategory = 'Scoping' | 'Planning' | 'Implementing' | 'Reviewing' | 'Deploying';
