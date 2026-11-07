export interface GradeLike {
  value: string;
  weight: number;
}

/**
 * Parse a grade value as written by eAsistent or a user: "5", "4,5" or
 * "4.5". Returns null for values that are not numeric.
 */
export function parseGradeValue(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (normalized.length === 0 || Number.isNaN(Number(normalized))) {
    return null;
  }
  return Number(normalized);
}

/**
 * Weighted average of grades, rounded to two decimals. Grades whose value
 * cannot be parsed are skipped; returns null when no usable grade remains.
 */
export function weightedAverage(grades: readonly GradeLike[]): number | null {
  let weightSum = 0;
  let weightedSum = 0;
  for (const grade of grades) {
    const value = parseGradeValue(grade.value);
    if (value === null || grade.weight <= 0) {
      continue;
    }
    weightedSum += value * grade.weight;
    weightSum += grade.weight;
  }
  if (weightSum === 0) {
    return null;
  }
  return Math.round((weightedSum / weightSum) * 100) / 100;
}
