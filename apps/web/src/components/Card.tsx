import type { ReactNode } from 'react';

export function Card({
  className = '',
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col rounded-lg border border-surface-border bg-surface p-4 ${className}`}
    >
      {children}
    </div>
  );
}
