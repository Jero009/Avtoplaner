import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-24 items-center justify-center gap-2 py-8 text-slate-500 dark:text-slate-400" role="status">
      <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      <span>{label ?? t('common.loading')}</span>
    </div>
  );
}
