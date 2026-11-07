import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, FlaskConical } from 'lucide-react';
import { useDb } from '../app/db-context';
import type { EventRecord, HomeworkRecord, SubjectRecord } from '../db/types';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { DbInitError } from '../components/DbInitError';
import { EasistentSyncButton } from '../components/EasistentSyncButton';
import { formatUtcInZone } from '../utils/dates';

interface HomeworkPageData {
  homework: HomeworkRecord[];
  subjects: Map<string, SubjectRecord>;
  tests: EventRecord[];
}

export function HomeworkPage() {
  const { t } = useTranslation();
  const dbState = useDb();
  const [data, setData] = useState<HomeworkPageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    if (dbState.status !== 'ready') {
      return;
    }
    try {
      const { homework, subjects, events } = dbState.database.repos;
      const [homeworkRows, subjectRows, eventRows] = await Promise.all([
        homework.listAll(),
        subjects.listAll(),
        events.listAll(),
      ]);
      setData({
        homework: [...homeworkRows].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
        subjects: new Map(subjectRows.map((subject) => [subject.id, subject])),
        tests: eventRows
          .filter(
            (event) =>
              event.source === 'easistent' && event.externalId?.startsWith('ea-test:'),
          )
          .sort((a, b) => a.startUtc.localeCompare(b.startUtc)),
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }, [dbState]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  if (dbState.status === 'loading') {
    return (
      <>
        <h1 className="mb-4 text-xl font-semibold">{t('homework.title')}</h1>
        <LoadingState label={t('db.loadingDb')} />
      </>
    );
  }

  if (dbState.status === 'error') {
    return (
      <>
        <h1 className="mb-4 text-xl font-semibold">{t('homework.title')}</h1>
        <DbInitError />
      </>
    );
  }

  const subjectName = (id: string | null): string => {
    if (!id) {
      return '';
    }
    const subject = data?.subjects.get(id);
    return subject ? (subject.shortName ?? subject.name) : '';
  };

  const toggleDone = async (item: HomeworkRecord) => {
    await dbState.database.repos.homework.setDone(item.id, !item.done);
    setReloadKey((key) => key + 1);
  };

  const open = data?.homework.filter((item) => !item.done) ?? [];
  const done = data?.homework.filter((item) => item.done) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{t('homework.title')}</h1>
        <EasistentSyncButton />
      </div>

      {error && (
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null);
            setReloadKey((key) => key + 1);
          }}
        />
      )}
      {!data && !error && <LoadingState />}

      {data && (
        <>
          <section className="card" aria-labelledby="homework-open-heading">
            <h2 id="homework-open-heading" className="section-title mb-2">
              {t('homework.open')}
            </h2>
            {open.length === 0 ? (
              <EmptyState icon={BookOpen} title={t('homework.noHomework')} />
            ) : (
              <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                {open.map((item) => (
                  <li key={item.id} className="flex min-h-11 items-center gap-3 py-1 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 accent-blue-600"
                      checked={false}
                      onChange={() => void toggleDone(item)}
                      aria-label={t('homework.markDone', { title: item.title })}
                    />
                    <span className="w-24 shrink-0 text-slate-500 tabular-nums dark:text-slate-400">
                      {item.dueDate}
                    </span>
                    <span className="min-w-0 flex-1">
                      {subjectName(item.subjectId) && (
                        <span className="font-medium">{subjectName(item.subjectId)}: </span>
                      )}
                      <span>{item.title}</span>
                      {item.description && (
                        <span className="block truncate text-slate-500 dark:text-slate-400">
                          {item.description}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card" aria-labelledby="homework-done-heading">
            <h2 id="homework-done-heading" className="section-title mb-2">
              {t('homework.doneSection')}
            </h2>
            {done.length === 0 ? (
              <EmptyState icon={BookOpen} title={t('homework.noHomeworkDone')} />
            ) : (
              <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                {done.map((item) => (
                  <li key={item.id} className="flex min-h-11 items-center gap-3 py-1 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 accent-blue-600"
                      checked
                      onChange={() => void toggleDone(item)}
                      aria-label={t('homework.markUndone', { title: item.title })}
                    />
                    <span className="w-24 shrink-0 text-slate-400 tabular-nums">
                      {item.dueDate}
                    </span>
                    <span className="min-w-0 flex-1 text-slate-400 line-through dark:text-slate-500">
                      {subjectName(item.subjectId) && `${subjectName(item.subjectId)}: `}
                      {item.title}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card" aria-labelledby="homework-tests-heading">
            <h2 id="homework-tests-heading" className="section-title mb-2">
              {t('homework.tests')}
            </h2>
            {data.tests.length === 0 ? (
              <EmptyState icon={FlaskConical} title={t('homework.noTests')} />
            ) : (
              <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                {data.tests.map((test) => (
                  <li key={test.id} className="flex min-h-11 items-center gap-3 py-1 text-sm">
                    <span className="w-28 shrink-0 text-slate-500 tabular-nums dark:text-slate-400">
                      {formatUtcInZone(test.startUtc, 'd.M. HH:mm')}
                    </span>
                    <span className="min-w-0 flex-1 font-medium">{test.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
