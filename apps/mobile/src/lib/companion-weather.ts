import type { CompanionWeather } from './companion-context';

export type CompanionCity = { id: string; name: string; country?: string; admin1?: string; latitude: number; longitude: number };
export type CompanionWeatherStatus = 'unset' | 'loading' | 'ready' | 'error';
export type CompanionWeatherState = { kind: CompanionWeather; status: CompanionWeatherStatus; error: string };
export type WeatherSnapshot = { kind: CompanionWeather; fetchedAt: number; observedAt: number };
export const WEATHER_TTL_MS = 30 * 60_000;
export const WEATHER_REQUEST_TIMEOUT_MS = 8_000;
const MAX_OBSERVATION_AGE_MS = 90 * 60_000;

export type CompanionWeatherFetch = (url: string, options?: RequestInit) => Promise<Response>;
type RequestOptions = { signal?: AbortSignal; fetcher?: CompanionWeatherFetch; now?: () => number };
function abortError() { const error = new Error('请求已取消'); error.name = 'AbortError'; return error; }
export function parseCompanionCity(value: unknown): CompanionCity | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if ((typeof item.id !== 'string' && typeof item.id !== 'number') || !String(item.id).trim()
    || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 120
    || typeof item.latitude !== 'number' || !Number.isFinite(item.latitude) || Math.abs(item.latitude) > 90
    || typeof item.longitude !== 'number' || !Number.isFinite(item.longitude) || Math.abs(item.longitude) > 180) return null;
  return { id: String(item.id), name: item.name.trim(), latitude: item.latitude, longitude: item.longitude,
    ...(typeof item.country === 'string' ? { country: item.country.slice(0, 120) } : {}),
    ...(typeof item.admin1 === 'string' ? { admin1: item.admin1.slice(0, 120) } : {}) };
}
export function weatherFromCode(code: unknown): CompanionWeather {
  if (code === 0 || code === 1) return 'clear';
  if ([2, 3, 45, 48].includes(code as number)) return 'cloudy';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code as number)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code as number)) return 'snow';
  if ([95, 96, 99].includes(code as number)) return 'storm';
  return 'unknown';
}

/** Public API only: deliberately separate from authenticated application API requests. */
async function requestJson(url: string, options: RequestOptions): Promise<unknown> {
  if (options.signal?.aborted) throw abortError();
  const controller = new AbortController();
  let timedOut = false;
  let rejectAbort: (error: Error) => void = () => {};
  const cancellation = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const cancel = () => { controller.abort(); rejectAbort(abortError()); };
  options.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; cancel(); }, WEATHER_REQUEST_TIMEOUT_MS);
  try {
    const operation = async () => {
      const response = await (options.fetcher ?? fetch)(url, { signal: controller.signal });
      if (!response.ok) throw new Error('暂时无法获取天气，请重试');
      return response.json() as Promise<unknown>;
    };
    return await Promise.race([operation(), cancellation]);
  } catch (error) {
    if (timedOut) throw new Error('请求超时，请重试');
    if (options.signal?.aborted) throw abortError();
    if (error instanceof Error && error.message === '暂时无法获取天气，请重试') throw error;
    throw new Error('网络不可用，请重试');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}
export async function searchCities(query: string, options: RequestOptions = {}): Promise<CompanionCity[]> {
  const term = query.trim().slice(0, 100);
  if (term.length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=8&language=zh&format=json`;
  const body = await requestJson(url, options) as { results?: unknown };
  if (!body || typeof body !== 'object' || (body.results !== undefined && !Array.isArray(body.results))) throw new Error('城市搜索暂不可用');
  return (Array.isArray(body.results) ? body.results : []).map(parseCompanionCity).filter((item): item is CompanionCity => item !== null);
}
export async function fetchCompanionWeather(city: CompanionCity, options: RequestOptions = {}): Promise<WeatherSnapshot> {
  if (!parseCompanionCity(city)) throw new Error('请选择有效城市');
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&current=weather_code&timeformat=unixtime&forecast_days=1`;
  const body = await requestJson(url, options) as { current?: { weather_code?: unknown; time?: unknown } };
  const kind = weatherFromCode(body?.current?.weather_code);
  const fetchedAt = (options.now ?? Date.now)();
  const seconds = body?.current?.time;
  const observedAt = typeof seconds === 'number' ? seconds * 1000 : NaN;
  if (kind === 'unknown' || !Number.isFinite(observedAt) || observedAt > fetchedAt + 5 * 60_000
    || fetchedAt - observedAt > MAX_OBSERVATION_AGE_MS) throw new Error('天气数据暂不可用，请重试');
  return { kind, fetchedAt, observedAt };
}
export function isWeatherFresh(snapshot: WeatherSnapshot, now = Date.now()): boolean {
  return now >= snapshot.fetchedAt && now - snapshot.fetchedAt < WEATHER_TTL_MS
    && now - snapshot.observedAt <= MAX_OBSERVATION_AGE_MS && snapshot.observedAt <= now + 5 * 60_000;
}

/** Owns cancellation and request identity so late responses can never change a newly selected city. */
export function createCompanionWeatherSession(options: {
  onChange: (state: CompanionWeatherState) => void;
  now?: () => number;
  load?: (city: CompanionCity, options: { signal: AbortSignal }) => Promise<WeatherSnapshot>;
}) {
  let city: CompanionCity | null = null;
  let generation = 0;
  let controller: AbortController | null = null;
  let cache: { key: string; snapshot: WeatherSnapshot } | null = null;
  const now = options.now ?? Date.now;
  const load = options.load ?? fetchCompanionWeather;
  const cancel = () => { generation += 1; controller?.abort(); controller = null; };
  const refresh = async (force = false) => {
    cancel();
    const requestId = generation;
    const selected = city;
    if (!selected) { options.onChange({ kind: 'unknown', status: 'unset', error: '' }); return; }
    const key = `${selected.id}:${selected.latitude}:${selected.longitude}`;
    if (!force && cache?.key === key && isWeatherFresh(cache.snapshot, now())) {
      options.onChange({ kind: cache.snapshot.kind, status: 'ready', error: '' }); return;
    }
    options.onChange({ kind: 'unknown', status: 'loading', error: '' });
    controller = new AbortController();
    try {
      const snapshot = await load(selected, { signal: controller.signal });
      if (requestId !== generation) return;
      if (!isWeatherFresh(snapshot, now())) throw new Error('天气数据暂不可用，请重试');
      cache = { key, snapshot };
      options.onChange({ kind: snapshot.kind, status: 'ready', error: '' });
    } catch (error) {
      if (requestId !== generation) return;
      cache = null;
      options.onChange({ kind: 'unknown', status: 'error', error: error instanceof Error ? error.message : '暂时无法获取天气，请重试' });
    } finally { if (requestId === generation) controller = null; }
  };
  return {
    select(next: CompanionCity | null) { city = parseCompanionCity(next); return refresh(); },
    refresh,
    cancel,
  };
}

/** One foreground subscription; role/keyboard focus deliberately does not own weather loading. */
export function watchCompanionWeather(
  session: ReturnType<typeof createCompanionWeatherSession>,
  city: CompanionCity | null,
  onTick: () => void = () => {},
): () => void {
  onTick();
  void session.select(city);
  const timer = setInterval(() => { onTick(); void session.refresh(); }, 60_000);
  return () => { clearInterval(timer); session.cancel(); };
}
