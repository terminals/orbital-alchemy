/** Check if an error message is a structured iTerm2 error from the server. */
export function isITermError(message: string): 'installed' | 'not-installed' | null {
  if (message.includes('ITERM2_NOT_INSTALLED')) return 'not-installed';
  if (message.includes('ITERM2_NOT_RUNNING')) return 'installed';
  return null;
}
