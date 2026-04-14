export interface PresetInfo {
  value: string;
  label: string;
  hint: string;
}

export const WORKFLOW_PRESETS: PresetInfo[] = [
  {
    value: 'default',
    label: 'Default',
    hint: '7 lists, trunk-based — Icebox → Planning → Backlog → Implementing → Review → Completed → Main',
  },
  {
    value: 'minimal',
    label: 'Minimal',
    hint: '3 lists — To Do → In Progress → Done',
  },
  {
    value: 'development',
    label: 'Development',
    hint: '5 lists, dev branch — Backlog → Implementing → Review → Completed → Dev',
  },
  {
    value: 'gitflow',
    label: 'Gitflow',
    hint: '9 lists, multi-branch — Full pipeline with Dev, Staging, and Production',
  },
];
