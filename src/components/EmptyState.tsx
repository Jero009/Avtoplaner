import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
}) {
  return (
    <div className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-700">
      <Icon className="size-8 text-slate-400 dark:text-slate-500" aria-hidden="true" />
      <p className="font-medium text-slate-600 dark:text-slate-300">{title}</p>
      {description && (
        <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
          {description}
        </p>
      )}
    </div>
  );
}
