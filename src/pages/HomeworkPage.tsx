import { useTranslation } from 'react-i18next';
import { BookOpen } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';

export function HomeworkPage() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('homework.title')}</h1>
      <EmptyState
        icon={BookOpen}
        title={t('homework.phase4Title')}
        description={t('homework.phase4Description')}
      />
    </div>
  );
}
