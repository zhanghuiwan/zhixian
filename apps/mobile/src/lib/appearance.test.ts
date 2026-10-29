import { describe, expect, it } from 'vitest';
import { appearanceDefaults, parseAppearance, resolveTheme } from './appearance';
describe('local appearance preferences', () => {
  it('uses safe defaults for corrupt and unknown persisted data', () => { expect(parseAppearance(null)).toEqual(appearanceDefaults); expect(parseAppearance({ theme: 'sepia', companionEnabled: 'no', reduceMotion: 1 })).toEqual(appearanceDefaults); });
  it('preserves explicit opt outs independently of the selected theme', () => { expect(parseAppearance({ theme: 'dark', companionEnabled: false, reduceMotion: true, reduceTransparency: true })).toEqual({ theme: 'dark', companionEnabled: false, reduceMotion: true, reduceTransparency: true }); });
  it('follows OS theme only for system preference', () => { expect(resolveTheme('system', 'dark')).toBe('dark'); expect(resolveTheme('system', null)).toBe('light'); expect(resolveTheme('light', 'dark')).toBe('light'); expect(resolveTheme('dark', 'light')).toBe('dark'); });
});
