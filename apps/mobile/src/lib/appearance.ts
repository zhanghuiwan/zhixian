export type ThemePreference = 'system' | 'light' | 'dark';
export type AppearancePreferences = { theme: ThemePreference; companionEnabled: boolean; reduceMotion: boolean; reduceTransparency: boolean };
export const appearanceDefaults: AppearancePreferences = { theme: 'system', companionEnabled: true, reduceMotion: false, reduceTransparency: false };
export function parseAppearance(value: unknown): AppearancePreferences {
  if (!value || typeof value !== 'object') return { ...appearanceDefaults };
  const candidate = value as Partial<AppearancePreferences>;
  return { theme: candidate.theme === 'light' || candidate.theme === 'dark' ? candidate.theme : 'system', companionEnabled: typeof candidate.companionEnabled === 'boolean' ? candidate.companionEnabled : true, reduceMotion: candidate.reduceMotion === true, reduceTransparency: candidate.reduceTransparency === true };
}
export function resolveTheme(preference: ThemePreference, system: string | null | undefined): 'light' | 'dark' { return preference === 'system' ? system === 'dark' ? 'dark' : 'light' : preference; }
