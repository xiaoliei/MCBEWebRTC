import type { ReactNode } from 'react';
import { Panel } from './Panel';

export interface SectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function Section({
  title,
  description,
  children,
  className
}: SectionProps) {
  const classes = ['app-section', className ?? ''].filter(Boolean).join(' ');

  return (
    <Panel className={classes}>
      <div className="app-section__header">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="app-section__body">{children}</div>
    </Panel>
  );
}
