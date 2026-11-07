import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';
import { EmptyState } from './EmptyState';
import {
  PX_PER_MINUTE,
  layoutTimeline,
  nowLineTopPx,
  type TimelineBlock,
} from '../utils/timeline';

export interface DayTimelineProps {
  /** Viewed day, YYYY-MM-DD (Ljubljana). */
  dayIso: string;
  blocks: TimelineBlock[];
  isToday: boolean;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  /** Allows injecting a clock in tests; the component ticks every 30 s. */
  now?: () => Date;
}

const NOW_TICK_MS = 30_000;

/** Stable default so the effect dependency doesn't churn identity per render. */
const defaultNow = () => new Date();

function minutesLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Full-height day timeline (Fossify/Google-Calendar style): hour gutter on
 * the left, colored rounded blocks per event with subject + room, a red
 * now-line that auto-scrolls into view, swipe + arrows to change the day.
 * All layout math lives in utils/timeline.ts (unit-tested).
 */
export function DayTimeline({
  dayIso,
  blocks,
  isToday,
  onPrevDay,
  onNextDay,
  onToday,
  now = defaultNow,
}: DayTimelineProps) {
  const { t, i18n } = useTranslation();
  const [nowDate, setNowDate] = useState(now);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setNowDate(now());
    const timer = window.setInterval(() => setNowDate(now()), NOW_TICK_MS);
    return () => window.clearInterval(timer);
  }, [now]);

  const layout = useMemo(() => layoutTimeline(blocks, dayIso), [blocks, dayIso]);
  const nowTop = nowLineTopPx(dayIso, nowDate, layout.startMin);

  // Auto-scroll: land ~1/3 viewport below the now-line on today, otherwise
  // show the first block of the day.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    const target =
      nowTop !== null
        ? nowTop - element.clientHeight / 3
        : (layout.positioned[0]?.top ?? 0) - element.clientHeight / 4;
    element.scrollTop = Math.max(0, target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayIso]);

  const dayLabel = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${dayIso}T12:00:00Z`));

  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) {
      return;
    }
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) > 64 && Math.abs(dx) > 2 * Math.abs(dy)) {
      if (dx < 0) {
        onNextDay();
      } else {
        onPrevDay();
      }
    }
  };

  return (
    <section
      className="card flex h-[62dvh] min-h-80 flex-col overflow-hidden p-0"
      aria-label={dayLabel}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-2 py-1.5 dark:border-slate-800">
        <button
          type="button"
          className="btn btn-secondary btn-icon"
          onClick={onPrevDay}
          aria-label={t('timeline.previousDay')}
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-base font-semibold" aria-live="polite">
            {dayLabel}
          </h2>
          {!isToday && (
            <button type="button" className="btn btn-secondary h-9 min-h-9 px-2 text-xs" onClick={onToday}>
              {t('timeline.goToday')}
            </button>
          )}
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-icon"
          onClick={onNextDay}
          aria-label={t('timeline.nextDay')}
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
      </div>

      {blocks.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState icon={CalendarClock} title={t('timeline.empty')} />
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="relative flex-1 overflow-y-auto overscroll-contain"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="relative flex" style={{ height: layout.heightPx }}>
            {/* Hour gutter */}
            <div className="relative w-14 shrink-0" aria-hidden="true">
              {layout.hourMarks.map((mark) => (
                <span
                  key={mark}
                  className="absolute right-1 -translate-y-1/2 text-xs tabular-nums text-slate-400 dark:text-slate-500"
                  style={{ top: (mark - layout.startMin) * PX_PER_MINUTE }}
                >
                  {minutesLabel(mark)}
                </span>
              ))}
            </div>

            {/* Event area */}
            <div className="relative flex-1 border-s border-slate-200 dark:border-slate-800">
              {layout.hourMarks.map((mark) => (
                <div
                  key={mark}
                  className="absolute inset-x-0 border-t border-slate-100 dark:border-slate-800"
                  style={{ top: (mark - layout.startMin) * PX_PER_MINUTE }}
                  aria-hidden="true"
                />
              ))}

              {layout.positioned.map(({ item, top, height, column, columnCount }) => (
                <div
                  key={item.id}
                  className={`absolute overflow-hidden rounded-lg px-2 py-1 text-xs text-white shadow-sm ${
                    item.status === 'cancelled'
                      ? 'opacity-55'
                      : item.status === 'test'
                        ? 'font-bold ring-2 ring-white/70'
                        : ''
                  }`}
                  style={{
                    top,
                    height,
                    left: `calc(${(column * 100) / columnCount}% + 2px)`,
                    width: `calc(${100 / columnCount}% - 4px)`,
                    backgroundColor: item.color,
                    textDecoration: item.status === 'cancelled' ? 'line-through' : undefined,
                  }}
                >
                  <p className="truncate font-medium leading-4">{item.title}</p>
                  {item.room && (
                    <p className="truncate leading-4 opacity-85">{item.room}</p>
                  )}
                  {item.status === 'changed' && item.note && (
                    <p className="truncate italic leading-4 opacity-85">{item.note}</p>
                  )}
                </div>
              ))}

              {nowTop !== null && nowTop >= 0 && nowTop <= layout.heightPx && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-10"
                  style={{ top: nowTop }}
                  aria-hidden="true"
                >
                  <div className="relative h-0.5 w-full bg-red-500">
                    <span className="absolute -start-1 -top-[3px] size-2 rounded-full bg-red-500" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
