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
    <div className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl px-4 py-8 text-center">
      <Icon className="size-8 text-nt-dim" aria-hidden="true" />
      <p className="font-medium text-nt-fg">{title}</p>
      {description && (
        <p className="max-w-md text-sm text-nt-dim">
          {description}
        </p>
      )}
    </div>
  );
}
