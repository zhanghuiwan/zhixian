export const SWIPE_LIMIT = 150;
export function isHorizontalSwipe(dx: number, dy: number) {
  return Math.abs(dx) >= 12 && Math.abs(dx) >= Math.abs(dy) * 1.15;
}
export function clampSwipe(dx: number) { return Math.max(-SWIPE_LIMIT, Math.min(SWIPE_LIMIT, dx)); }
export function finishSwipe(dx: number): { score: 0 | 90; offset: 0 } | { score: null; offset: number } {
  if (Math.abs(dx) >= 118) return { score: dx > 0 ? 0 : 90, offset: 0 };
  return { score: null, offset: Math.abs(dx) >= 44 ? (dx > 0 ? 76 : -76) : 0 };
}
