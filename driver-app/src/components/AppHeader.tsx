import type { ReactNode } from 'react';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}

export default function AppHeader({ title, subtitle, right }: AppHeaderProps) {
  return (
    <header className="flex items-start justify-between px-5 pt-12 pb-5">
      <div>
        <h1 className="text-xl font-semibold text-white leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-white/40 mt-0.5">{subtitle}</p>}
      </div>
      {right && <div className="ml-4 flex-shrink-0">{right}</div>}
    </header>
  );
}
