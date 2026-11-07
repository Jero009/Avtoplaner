import { describe, expect, it } from 'vitest';
import { parseGradeValue, weightedAverage } from './averages';
import type { GradeLike } from './averages';

describe('parseGradeValue', () => {
  it('parses plain integers', () => {
    expect(parseGradeValue('5')).toBe(5);
  });

  it('parses decimal comma and decimal point', () => {
    expect(parseGradeValue('4,5')).toBe(4.5);
    expect(parseGradeValue('4.5')).toBe(4.5);
  });

  it('returns null for non-numeric values', () => {
    expect(parseGradeValue('')).toBeNull();
    expect(parseGradeValue('neocenjen')).toBeNull();
    expect(parseGradeValue('*')).toBeNull();
  });
});

describe('weightedAverage', () => {
  function grade(value: string, weight = 1): GradeLike {
    return { value, weight };
  }

  it('computes a simple mean for equal weights', () => {
    expect(
      weightedAverage([grade('5'), grade('4'), grade('3')]),
    ).toBe(4);
  });

  it('weights grades by their weight', () => {
    expect(weightedAverage([grade('5', 1), grade('3', 3)])).toBe(3.5);
  });

  it('rounds to two decimals', () => {
    expect(weightedAverage([grade('5', 1), grade('4', 2)])).toBe(4.33);
  });

  it('skips grades with non-numeric values', () => {
    expect(weightedAverage([grade('5'), grade('abc'), grade('3')])).toBe(4);
  });

  it('returns null for an empty list', () => {
    expect(weightedAverage([])).toBeNull();
  });

  it('returns null when no grade is usable', () => {
    expect(weightedAverage([grade('x'), grade('y')])).toBeNull();
  });

  it('ignores grades with non-positive weight', () => {
    expect(weightedAverage([grade('5', 0), grade('3', 2)])).toBe(3);
  });
});
