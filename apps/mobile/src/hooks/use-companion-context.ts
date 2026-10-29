import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { companionContextKey, companionDelay, getCompanionDaypart, nextCompanionMoment, parseCompanionMood, shouldRefreshCompanionContext, type CompanionMood } from '@/lib/companion-context';
import { createCompanionWeatherSession, parseCompanionCity, watchCompanionWeather, type CompanionCity, type CompanionWeatherState } from '@/lib/companion-weather';

export const COMPANION_PREFERENCES_KEY = 'zhixian.companion-context.v1';

export function useCompanionContext({ active, reduceMotion }: { active: boolean; reduceMotion: boolean }) {
  const [mood, updateMood] = useState<CompanionMood>('auto');
  const [city, updateCity] = useState<CompanionCity | null>(null);
  const [ready, setReady] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [daypart, setDaypart] = useState(() => getCompanionDaypart());
  const [weather, updateWeather] = useState<CompanionWeatherState>({ kind: 'unknown', status: 'unset', error: '' });
  const [presentation, setPresentation] = useState(() => ({
    moment: nextCompanionMoment({ mood: 'auto', weather: 'unknown', daypart: getCompanionDaypart() }), revision: 0,
  }));
  const presentedContext = useRef(companionContextKey({ mood: 'auto', weather: 'unknown', daypart }));
  const touched = useRef({ mood: false, city: false });
  const persistence = useRef<Promise<unknown>>(Promise.resolve());
  const [weatherSession] = useState(() => createCompanionWeatherSession({ onChange: updateWeather }));
  const setMood = useCallback((next: CompanionMood) => { touched.current.mood = true; updateMood(parseCompanionMood(next)); }, []);
  const setCity = useCallback((next: CompanionCity | null) => { touched.current.city = true; updateCity(parseCompanionCity(next)); }, []);
  const advance = useCallback(() => {
    const context = { mood, weather: weather.kind, daypart: getCompanionDaypart() };
    presentedContext.current = companionContextKey(context);
    setPresentation(current => ({ moment: nextCompanionMoment(context, current.moment), revision: current.revision + 1 }));
  }, [mood, weather.kind]);
  const refreshWeather = useCallback(() => weatherSession.refresh(true), [weatherSession]);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(COMPANION_PREFERENCES_KEY).then(raw => {
      if (!mounted) return;
      try {
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === 'object') {
          const value = parsed as { mood?: unknown; city?: unknown };
          if (!touched.current.mood) updateMood(parseCompanionMood(value.mood));
          if (!touched.current.city) updateCity(parseCompanionCity(value.city));
        }
      } catch { /* Corrupt local preferences use defaults; no personal content is logged. */ }
    }).catch(() => {}).finally(() => { if (mounted) setReady(true); });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const value = JSON.stringify({ mood, city });
    persistence.current = persistence.current.catch(() => {}).then(() => AsyncStorage.setItem(COMPANION_PREFERENCES_KEY, value)).catch(() => {});
  }, [mood, city, ready]);
  useEffect(() => () => weatherSession.cancel(), [weatherSession]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setForeground(state === 'active');
      if (state !== 'active') weatherSession.cancel();
    });
    return () => subscription.remove();
  }, [weatherSession]);
  useEffect(() => {
    if (!foreground) return;
    return watchCompanionWeather(weatherSession, city, () => setDaypart(getCompanionDaypart()));
  }, [city, foreground, weatherSession]);
  useEffect(() => {
    const context = { mood, weather: weather.kind, daypart: getCompanionDaypart() };
    if (!shouldRefreshCompanionContext(context, presentedContext.current, active, foreground)) return;
    presentedContext.current = companionContextKey(context);
    setPresentation(current => ({ moment: nextCompanionMoment(context, current.moment), revision: current.revision + 1 }));
  }, [mood, weather.kind, daypart, active, foreground]);
  useEffect(() => {
    if (!active || !foreground || reduceMotion) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => { timer = setTimeout(() => { advance(); schedule(); }, companionDelay()); };
    schedule();
    return () => clearTimeout(timer);
  }, [active, foreground, reduceMotion, advance]);

  return { ...presentation, foreground, advance, mood, setMood, city, setCity, daypart,
    weatherKind: weather.kind, weatherStatus: weather.status, weatherError: weather.error, refreshWeather };
}
