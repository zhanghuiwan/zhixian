import { describe, expect, it } from 'vitest';
import { companionContextKey, companionDelay, getCompanionCandidates, getCompanionDaypart, nextCompanionMoment, parseCompanionMood, shouldRefreshCompanionContext, type CompanionContext } from './companion-context';

const context: CompanionContext = { mood: 'auto', weather: 'unknown', daypart: 'afternoon' };
describe('local companion suggestions', () => {
  it('uses local time at all mini-program scene boundaries', () => {
    const expected = [[0, 'night'], [5, 'night'], [6, 'morning'], [11, 'morning'], [12, 'afternoon'], [17, 'afternoon'], [18, 'evening'], [19, 'night'], [23, 'night']];
    for (const [hour, period] of expected) expect(getCompanionDaypart(new Date(2026, 9, 29, Number(hour), 59))).toBe(period);
  });
  it('does not assume a mood or weather that the user never selected', () => {
    const options = getCompanionCandidates(context);
    expect(options.some(item => /^(rain|snow|storm|clear|cloudy|tired|cheerful|focused|calm)-/.test(item.id))).toBe(false);
    expect(options.some(item => item.action === 'sleep' || item.action === 'umbrella')).toBe(false);
    expect(parseCompanionMood('joyful')).toBe('auto');
  });
  it('adds multiple fitting suggestions for every mood, time and known weather', () => {
    for (const mood of ['calm', 'cheerful', 'focused', 'tired'] as const) expect(getCompanionCandidates({ ...context, mood }).filter(item => item.id.startsWith(mood))).toHaveLength(3);
    for (const weather of ['clear', 'cloudy', 'rain', 'snow', 'storm'] as const) expect(getCompanionCandidates({ ...context, weather }).filter(item => item.id.startsWith(weather))).toHaveLength(3);
    for (const daypart of ['morning', 'afternoon', 'evening', 'night'] as const) expect(getCompanionCandidates({ ...context, daypart }).filter(item => item.id.startsWith(daypart))).toHaveLength(3);
  });
  it('always changes both action and text even for extreme random values', () => {
    let previous = nextCompanionMoment(context, null, () => 0);
    for (const value of [0, 1, -1, NaN, Infinity, .5, .999999]) {
      const next = nextCompanionMoment({ mood: 'tired', weather: 'rain', daypart: 'night' }, previous, () => value);
      expect(next.action).not.toBe(previous.action);
      expect(next.id).not.toBe(previous.id);
      expect(next.text).not.toBe(previous.text);
      expect(next.text.length).toBeLessThan(40);
      previous = next;
    }
  });
  it('does not change the initial or unchanged suggestion when focus resumes', () => {
    const presented = companionContextKey(context);
    expect(shouldRefreshCompanionContext(context, presented, true, true)).toBe(false);
    expect(shouldRefreshCompanionContext(context, presented, false, true)).toBe(false);
    // Returning from typing or a history sheet with no new context does not consume another suggestion.
    expect(shouldRefreshCompanionContext({ ...context }, presented, true, true)).toBe(false);
  });
  it('defers changed context until idle and foreground, then consumes it once', () => {
    let presented = companionContextKey(context);
    const changed: CompanionContext = { mood: 'tired', weather: 'rain', daypart: 'night' };
    expect(shouldRefreshCompanionContext(changed, presented, false, true)).toBe(false);
    expect(shouldRefreshCompanionContext(changed, presented, true, false)).toBe(false);
    expect(shouldRefreshCompanionContext(changed, presented, false, false)).toBe(false);
    expect(shouldRefreshCompanionContext(changed, presented, true, true)).toBe(true);
    presented = companionContextKey(changed);
    expect(shouldRefreshCompanionContext(changed, presented, true, true)).toBe(false);
    // An explicit advance marks this same context as presented, including a time boundary.
    const manualContext = { ...changed, daypart: 'morning' as const };
    presented = companionContextKey(manualContext);
    expect(shouldRefreshCompanionContext(manualContext, presented, true, true)).toBe(false);
  });
  it('keeps autonomous changes between 28 and 46 seconds', () => {
    expect(companionDelay(() => 0)).toBe(28_000);
    expect(companionDelay(() => 1)).toBe(46_000);
    expect(companionDelay(() => -3)).toBe(28_000);
  });
});
