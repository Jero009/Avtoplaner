import { useTranslation } from 'react-i18next';
import { CalendarClock } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';

export function TimetablePage() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('timetable.title')}</h1>
      <EmptyState
        icon={CalendarClock}
        title={t('timetable.phase4Title')}
        description={t('timetable.phase4Description')}
      />
    </div>
  );
}
