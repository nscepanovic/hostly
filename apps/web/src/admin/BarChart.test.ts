import { describe, expect, it } from 'vitest';
import { niceScale } from './BarChart';

describe('niceScale', () => {
  it('fits the data with whole-number gridlines, at most 5 steps', () => {
    expect(niceScale(0)).toEqual({ max: 4, step: 1 });
    expect(niceScale(3)).toEqual({ max: 4, step: 1 });
    expect(niceScale(10)).toEqual({ max: 10, step: 2 });
    expect(niceScale(11)).toEqual({ max: 15, step: 5 });
    expect(niceScale(37)).toEqual({ max: 40, step: 10 });
    expect(niceScale(180)).toEqual({ max: 200, step: 50 });
  });
});
