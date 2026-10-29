import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, useColorScheme } from 'react-native';
import { darkColors, lightColors, type ThemeColors } from '@/constants/theme';
import { appearanceDefaults, parseAppearance, resolveTheme, type AppearancePreferences } from '@/lib/appearance';
const key = 'zhixian.appearance.v1';
type AppearanceContextValue = { colors: ThemeColors; scheme: 'light' | 'dark'; preferences: AppearancePreferences; reduceMotion: boolean; reduceTransparency: boolean; ready: boolean; update: (patch: Partial<AppearancePreferences>) => void };
const AppearanceContext = createContext<AppearanceContextValue | null>(null);
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme(); const [preferences, setPreferences] = useState(appearanceDefaults); const [ready, setReady] = useState(false);
  const [systemMotion, setSystemMotion] = useState(false); const [systemTransparency, setSystemTransparency] = useState(false); const writes = useRef(Promise.resolve());
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(key).then((value) => { if (live && value) { try { setPreferences(parseAppearance(JSON.parse(value))); } catch { /* Ignore corrupt local preferences. */ } } }).catch(() => undefined).finally(() => { if (live) setReady(true); });
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (live) setSystemMotion(value); }).catch(() => undefined);
    if (Platform.OS === 'ios') AccessibilityInfo.isReduceTransparencyEnabled().then((value) => { if (live) setSystemTransparency(value); }).catch(() => undefined);
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemMotion); const transparency = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setSystemTransparency);
    return () => { live = false; motion.remove(); transparency.remove(); };
  }, []);
  const scheme = resolveTheme(preferences.theme, system); const colors = scheme === 'dark' ? darkColors : lightColors;
  useEffect(() => { SystemUI.setBackgroundColorAsync(colors.background).catch(() => undefined); }, [colors]);
  useEffect(() => { if (ready) writes.current = writes.current.then(() => AsyncStorage.setItem(key, JSON.stringify(preferences))).catch(() => undefined); }, [preferences, ready]);
  const value = useMemo(() => ({ colors, scheme, preferences, ready, reduceMotion: preferences.reduceMotion || systemMotion, reduceTransparency: preferences.reduceTransparency || systemTransparency, update: (patch: Partial<AppearancePreferences>) => setPreferences((current) => parseAppearance({ ...current, ...patch })) }), [colors, scheme, preferences, ready, systemMotion, systemTransparency]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}
export function useAppearance() { const value = useContext(AppearanceContext); if (!value) throw new Error('AppearanceProvider is required'); return value; }
export function useThemedStyles<T>(factory: (colors: ThemeColors) => T) { const { colors } = useAppearance(); const styles = useMemo(() => factory(colors), [colors, factory]); return { colors, styles }; }
