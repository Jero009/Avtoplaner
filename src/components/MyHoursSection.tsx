import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { useDb } from '../app/db-context';
import { DbInitError } from './DbInitError';
import { LoadingState } from './LoadingState';
import {
  GROUP_CHOICES_KEY,
  type ConflictSlot,
  detectSlotConflicts,
  parseChoices,
  serializeChoices,
} from '../integrations/easistent/group-choice';
import type { GroupChoices } from '../integrations/easistent/group-choice';

/** Monday of a fixed ISO week, used only to format weekday names. */
const WEEKDAY_ANCHOR = Date.parse('2026-11-09T12:00:00Z'); // a Monday

function weekdayName(locale: string, isoWeekday: number): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(new Date(WEEKDAY_ANCHOR + (isoWeekday - 1) * 86_400_000));
}

/** The stored choice value for a slot, or '' when it shows everything. */
function chosenValue(slot: ConflictSlot, choices: GroupChoices): string {
  const value = choices[slot.key];
  if (!value) {
    return '';
  }
  const valid = slot.options.some((option) =>
    value === (option.subject.externalId ?? option.subject.id) || value === option.subject.id,
  );
  return valid ? value : '';
}

/**
 * Settings section "Moje ure / My hours": for every weekly slot where the
 * class is split into groups, the user picks once which lesson is his (or
 * resets to "show all"). Choices apply at sync time and at render time.
 */
export function MyHoursSection() {
  const { t, i18n } = useTranslation();
  const dbState = useDb();
  const db = dbState.status === 'ready' ? dbState.database : null;
  const [state, setState] = useState<{
    conflicts: ConflictSlot[];
    choices: GroupChoices;
  } | null>(null);

  const load = useCallback(async () => {
    if (!db) {
      return;
    }
    const [lessons, subjects, raw] = await Promise.all([
      db.repos.lessons.listAll(),
      db.repos.subjects.listAll(),
      db.repos.settings.get(GROUP_CHOICES_KEY),
    ]);
    setState({
      conflicts: detectSlotConflicts(lessons, subjects),
      choices: parseChoices(raw),
    });
  }, [db]);

  useEffect(() => {
    void load();
  }, [load]);

  const pick = async (slot: ConflictSlot, value: string | null) => {
    if (!db) {
      return;
    }
    const next = { ...state?.choices };
    if (value === null) {
      delete next[slot.key];
    } else {
      next[slot.key] = value;
    }
    setState((current) =>
      current ? { ...current, choices: next } : current,
    );
    await db.repos.settings.set(GROUP_CHOICES_KEY, serializeChoices(next));
  };

  const optionLabel = (teacher: string | null, room: string | null): string => {
    const parts: string[] = [];
    if (teacher) {
      parts.push(teacher);
    }
    if (room) {
      parts.push(`${t('myHours.roomPrefix')} ${room}`);
    }
    return parts.join(' · ');
  };

  const hasUnchosen =
    state?.conflicts.some((slot) => chosenValue(slot, state.choices) === '') ?? false;

  return (
    <section className="card" aria-labelledby="myhours-heading">
      <h2 id="myhours-heading" className="section-title mb-1">
        {t('myHours.title')}
      </h2>
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
        {t('myHours.description')}
      </p>

      {dbState.status === 'error' && <DbInitError />}
      {state === null && dbState.status !== 'error' && <LoadingState />}

      {state && state.conflicts.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('myHours.empty')}</p>
      )}

      {state && state.conflicts.length > 0 && (
        <>
          {hasUnchosen && (
            <p
              role="status"
              className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300"
            >
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              {t('myHours.hint')}
            </p>
          )}
          <div className="flex flex-col gap-4">
            {state.conflicts.map((slot) => {
              const selected = chosenValue(slot, state.choices);
              const labelId = `myhours-slot-${slot.key.replace(/[^a-z0-9]/gi, '-')}`;
              return (
                <fieldset key={slot.key} className="min-w-0">
                  <legend id={labelId} className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t('myHours.slotLabel', {
                      weekday: weekdayName(i18n.language, slot.isoWeekday),
                      from: slot.from,
                      to: slot.to,
                    })}
                  </legend>
                  <div
                    role="radiogroup"
                    aria-labelledby={labelId}
                    className="flex flex-col gap-1"
                  >
                    {slot.options.map((option) => {
                      const value = option.subject.externalId ?? option.subject.id;
                      return (
                        <label
                          key={option.subject.id}
                          className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <input
                            type="radio"
                            name={slot.key}
                            className="size-4 accent-blue-600"
                            checked={selected === value}
                            onChange={() => void pick(slot, value)}
                          />
                          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                            <span className="font-medium">
                              {option.subject.shortName ?? option.subject.name}
                            </span>
                            <span className="text-slate-500 dark:text-slate-400">
                              {optionLabel(option.teacher, option.classroom)}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                    <label
                      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      <input
                        type="radio"
                        name={slot.key}
                        className="size-4 accent-blue-600"
                        checked={selected === ''}
                        onChange={() => void pick(slot, null)}
                      />
                      {t('myHours.showAll')}
                    </label>
                  </div>
                </fieldset>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
