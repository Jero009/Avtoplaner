import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-24 flex-col items-center justify-center gap-3 py-8 text-red-600 dark:text-red-400" role="alert">
      <div className="flex items-center gap-2">
        <AlertCircle className="size-5" aria-hidden="true" />
        <span>{message ?? t('common.error')}</span>
      </div>
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}
