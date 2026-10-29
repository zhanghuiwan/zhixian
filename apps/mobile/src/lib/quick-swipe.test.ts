import { describe, expect, it } from 'vitest';
import { clampSwipe, finishSwipe, isHorizontalSwipe } from './quick-swipe';
describe('mini-program quick review gestures', () => {
  it('leaves vertical scrolling and incidental movement alone', () => {
    expect(isHorizontalSwipe(11, 0)).toBe(false);
    expect(isHorizontalSwipe(40, 60)).toBe(false);
    expect(isHorizontalSwipe(60, 20)).toBe(true);
  });
  it('uses right for forgotten, left for familiar and requires a deliberate swipe', () => {
    expect(finishSwipe(118).score).toBe(0);
    expect(finishSwipe(-118).score).toBe(90);
    expect(finishSwipe(117)).toEqual({ score: null, offset: 76 });
    expect(finishSwipe(-44)).toEqual({ score: null, offset: -76 });
    expect(finishSwipe(43)).toEqual({ score: null, offset: 0 });
    expect(clampSwipe(-250)).toBe(-150);
  });
});
