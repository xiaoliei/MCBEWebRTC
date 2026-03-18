import type { ReactNode } from 'react';

type StatusChipTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface StatusChipProps {
  tone?: StatusChipTone;
  children: ReactNode;
}

export function StatusChip({
  tone = 'neutral',
  children
}: StatusChipProps) {
  return <span className={`pixel-chip pixel-chip--${tone}`}>{children}</span>;
}
