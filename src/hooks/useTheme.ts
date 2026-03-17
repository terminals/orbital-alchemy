import { useEffect } from 'react';

export function useTheme() {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'neon-glass');
  }, []);

  return { neonGlass: true as const };
}
