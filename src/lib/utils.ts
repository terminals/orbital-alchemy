import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Decode a scope DB id back to display format: 47→"047", 1047→"047a", 9013→"013X" */
export function formatScopeId(id: number): string {
  if (id < 1000) return `#${String(id).padStart(3, '0')}`;
  const base = id % 1000;
  const tier = Math.floor(id / 1000);
  const suffix = tier === 9 ? 'X' : String.fromCharCode(96 + tier);
  return `#${String(base).padStart(3, '0')}${suffix}`;
}
