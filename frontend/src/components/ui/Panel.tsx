import type { HTMLAttributes, ReactNode } from 'react';

type PanelVariant = 'default' | 'subtle' | 'accent';

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: PanelVariant;
  children: ReactNode;
}

export function Panel({
  variant = 'default',
  className,
  children,
  ...props
}: PanelProps) {
  const classes = ['pixel-panel', `pixel-panel--${variant}`, className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}
