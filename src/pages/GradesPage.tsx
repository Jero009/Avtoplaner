import { useTranslation } from 'react-i18next';
import { GraduationCap } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';

export function GradesPage() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('grades.title')}</h1>
      <EmptyState
        icon={GraduationCap}
        title={t('grades.phase4Title')}
        description={t('grades.phase4Description')}
      />
    </div>
  );
}
