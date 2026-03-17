import { type Modifier } from '@dnd-kit/core';
import { useMemo } from 'react';
import { useSettings } from './useSettings';

export function useZoomModifier(): Modifier[] {
  const { settings } = useSettings();

  return useMemo(() => {
    if (settings.fontScale === 1) return [];

    const zoomModifier: Modifier = ({ transform }) => ({
      ...transform,
      x: transform.x / settings.fontScale,
      y: transform.y / settings.fontScale,
    });

    return [zoomModifier];
  }, [settings.fontScale]);
}
