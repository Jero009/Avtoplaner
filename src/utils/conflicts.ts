export interface ConflictCandidate {
  id: string;
  startUtc: string;
  endUtc: string;
}

function overlaps(a: ConflictCandidate, b: ConflictCandidate): boolean {
  return (
    Date.parse(a.startUtc) < Date.parse(b.endUtc) &&
    Date.parse(b.startUtc) < Date.parse(a.endUtc)
  );
}

/**
 * Find every event that overlaps at least one other event. Events that
 * merely touch (one ends exactly when the other starts) do not conflict.
 */
export function findConflictingIds<T extends ConflictCandidate>(
  events: readonly T[],
): Set<string> {
  const conflicting = new Set<string>();
  for (let i = 0; i < events.length; i += 1) {
    for (let j = i + 1; j < events.length; j += 1) {
      const a = events[i]!;
      const b = events[j]!;
      if (overlaps(a, b)) {
        conflicting.add(a.id);
        conflicting.add(b.id);
      }
    }
  }
  return conflicting;
}
