import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCompanionWeatherSession, fetchCompanionWeather, isWeatherFresh, parseCompanionCity, searchCities, WEATHER_REQUEST_TIMEOUT_MS, WEATHER_TTL_MS, weatherFromCode, watchCompanionWeather, type CompanionWeatherFetch, type CompanionCity, type CompanionWeatherState, type WeatherSnapshot } from './companion-weather';

const now = Date.UTC(2026, 9, 29, 10);
const city: CompanionCity = { id: 'test-a', name: '示例城', latitude: 30, longitude: 120 };
const snapshot = (kind: WeatherSnapshot['kind']): WeatherSnapshot => ({ kind, fetchedAt: now, observedAt: now });
const response = (body: unknown) => ({ ok: true, json: async () => body }) as Response;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
afterEach(() => vi.useRealTimers());

describe('public weather API boundary', () => {
  it('maps current WMO codes, treating unknown codes as unknown rather than sunny', () => {
    for (const code of [0, 1]) expect(weatherFromCode(code)).toBe('clear');
    for (const code of [2, 3, 45, 48]) expect(weatherFromCode(code)).toBe('cloudy');
    for (const code of [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82]) expect(weatherFromCode(code)).toBe('rain');
    for (const code of [71, 73, 75, 77, 85, 86]) expect(weatherFromCode(code)).toBe('snow');
    for (const code of [95, 96, 99]) expect(weatherFromCode(code)).toBe('storm');
    for (const code of [undefined, null, NaN, 97, 999, '0']) expect(weatherFromCode(code)).toBe('unknown');
  });
  it('validates persisted cities and encodes city searches without tokens or location permissions', async () => {
    expect(parseCompanionCity({ ...city, latitude: 91 })).toBeNull();
    expect(parseCompanionCity({ ...city, longitude: NaN })).toBeNull();
    const fetcher = vi.fn<CompanionWeatherFetch>().mockResolvedValue(response({ results: [{ ...city, id: 123, country: '示例' }, { ...city, latitude: null }] }));
    expect(await searchCities('  a&b  ', { fetcher })).toEqual([{ ...city, id: '123', country: '示例' }]);
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toContain('name=a%26b&');
    expect(options).not.toHaveProperty('headers');
    expect(await searchCities('a', { fetcher })).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('fetches only selected city coordinates and refuses stale or malformed observations', async () => {
    const fetcher = vi.fn<CompanionWeatherFetch>().mockResolvedValue(response({ current: { weather_code: 61, time: now / 1000 } }));
    expect(await fetchCompanionWeather(city, { fetcher, now: () => now })).toEqual(snapshot('rain'));
    expect(String(fetcher.mock.calls[0][0])).toContain('latitude=30&longitude=120&current=weather_code');
    fetcher.mockResolvedValueOnce(response({ current: { weather_code: 0, time: (now - 91 * 60_000) / 1000 } }));
    await expect(fetchCompanionWeather(city, { fetcher, now: () => now })).rejects.toThrow('天气数据暂不可用');
    fetcher.mockResolvedValueOnce(response({ current: { weather_code: 0, time: (now + 6 * 60_000) / 1000 } }));
    await expect(fetchCompanionWeather(city, { fetcher, now: () => now })).rejects.toThrow('天气数据暂不可用');
    fetcher.mockResolvedValueOnce(response({ current: { weather_code: 0 } }));
    await expect(fetchCompanionWeather(city, { fetcher, now: () => now })).rejects.toThrow('天气数据暂不可用');
  });
  it('terminates on timeout even if the fetch implementation ignores AbortSignal', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<CompanionWeatherFetch>().mockImplementation(() => new Promise(() => {}));
    const request = fetchCompanionWeather(city, { fetcher });
    const assertion = expect(request).rejects.toThrow('请求超时');
    await vi.advanceTimersByTimeAsync(WEATHER_REQUEST_TIMEOUT_MS);
    await assertion;
    expect((fetcher.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels before or during a request without leaking timeout handles', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetcher = vi.fn<CompanionWeatherFetch>().mockImplementation(() => new Promise(() => {}));
    const pending = searchCities('示例', { fetcher, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBe(0);
    await expect(searchCities('示例', { fetcher, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('normalizes unavailable and malformed responses into recoverable errors', async () => {
    const fetcher = vi.fn<CompanionWeatherFetch>().mockRejectedValue(new Error('private response body'));
    await expect(fetchCompanionWeather(city, { fetcher })).rejects.toThrow('网络不可用');
    fetcher.mockResolvedValueOnce({ ok: false } as Response);
    await expect(fetchCompanionWeather(city, { fetcher })).rejects.toThrow('暂时无法获取天气');
    fetcher.mockResolvedValueOnce(response({ results: 'invalid' }));
    await expect(searchCities('示例', { fetcher })).rejects.toThrow('城市搜索暂不可用');
  });
  it('expires at the cache boundary and rejects backward clock jumps', () => {
    expect(isWeatherFresh(snapshot('clear'), now + WEATHER_TTL_MS - 1)).toBe(true);
    expect(isWeatherFresh(snapshot('clear'), now + WEATHER_TTL_MS)).toBe(false);
    expect(isWeatherFresh(snapshot('clear'), now - 1)).toBe(false);
  });
});

describe('weather request ownership and cache', () => {
  it('never overwrites the selected city with a late response or failure', async () => {
    const first = deferred<WeatherSnapshot>(); const second = deferred<WeatherSnapshot>();
    const states: CompanionWeatherState[] = [];
    const load = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const session = createCompanionWeatherSession({ onChange: value => states.push(value), load, now: () => now });
    const oldRequest = session.select(city);
    const newRequest = session.select({ ...city, id: 'test-b', longitude: 121 });
    expect(load.mock.calls[0][1].signal.aborted).toBe(true);
    second.resolve(snapshot('snow')); await newRequest;
    first.resolve(snapshot('rain')); await oldRequest;
    expect(states.at(-1)).toEqual({ kind: 'snow', status: 'ready', error: '' });
    expect(states.some(item => item.kind === 'rain')).toBe(false);
  });
  it('uses a fresh cache, drops expired weather while loading, and allows explicit retry', async () => {
    let clock = now;
    const states: CompanionWeatherState[] = [];
    const load = vi.fn().mockResolvedValueOnce(snapshot('clear')).mockRejectedValueOnce(new Error('网络不可用，请重试')).mockResolvedValueOnce({ ...snapshot('rain'), fetchedAt: now + WEATHER_TTL_MS, observedAt: now + WEATHER_TTL_MS });
    const session = createCompanionWeatherSession({ onChange: value => states.push(value), load, now: () => clock });
    await session.select(city); await session.refresh();
    expect(load).toHaveBeenCalledTimes(1);
    clock += WEATHER_TTL_MS;
    await session.refresh();
    expect(states.at(-2)).toEqual({ kind: 'unknown', status: 'loading', error: '' });
    expect(states.at(-1)?.status).toBe('error');
    expect(states.at(-1)?.kind).toBe('unknown');
    await session.refresh(true);
    expect(states.at(-1)?.kind).toBe('rain');
  });
  it('does not revive an old cached result after a failed explicit refresh', async () => {
    const states: CompanionWeatherState[] = [];
    const load = vi.fn().mockResolvedValueOnce(snapshot('clear')).mockRejectedValueOnce(new Error('网络不可用')).mockResolvedValueOnce(snapshot('cloudy'));
    const session = createCompanionWeatherSession({ onChange: value => states.push(value), load, now: () => now });
    await session.select(city);
    await session.refresh(true);
    expect(states.at(-1)?.kind).toBe('unknown');
    await session.refresh();
    expect(load).toHaveBeenCalledTimes(3);
    expect(states.at(-1)?.kind).toBe('cloudy');
  });
  it('rejects stale results even if a custom transport returns one', async () => {
    const states: CompanionWeatherState[] = [];
    const session = createCompanionWeatherSession({ onChange: value => states.push(value), now: () => now + WEATHER_TTL_MS, load: async () => snapshot('rain') });
    await session.select(city);
    expect(states.at(-1)?.status).toBe('error');
    expect(states.at(-1)?.kind).toBe('unknown');
  });
  it('recovers a cancelled pending weather request when foreground resumes with the settings sheet still open', async () => {
    vi.useFakeTimers();
    const first = deferred<WeatherSnapshot>(); const resumed = deferred<WeatherSnapshot>();
    const states: CompanionWeatherState[] = [];
    const load = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(resumed.promise);
    const session = createCompanionWeatherSession({ onChange: value => states.push(value), load, now: () => now });
    // The foreground watch is independent of role activity: opening a sheet cannot block this request.
    const stop = watchCompanionWeather(session, city);
    expect(load).toHaveBeenCalledTimes(1);
    stop();
    expect(load.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    const stopResumed = watchCompanionWeather(session, city);
    expect(load).toHaveBeenCalledTimes(2);
    resumed.resolve(snapshot('rain')); await resumed.promise;
    expect(states.at(-1)).toEqual({ kind: 'rain', status: 'ready', error: '' });
    first.resolve(snapshot('clear')); await first.promise;
    expect(states.at(-1)?.kind).toBe('rain');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(load).toHaveBeenCalledTimes(2);
    stopResumed();
    // Resuming again uses fresh cache without adding a request, nor does unmount emit new state.
    const stopCached = watchCompanionWeather(session, city);
    expect(load).toHaveBeenCalledTimes(2);
    const count = states.length; stopCached();
    expect(states).toHaveLength(count);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('foreground weather watching makes no network calls without an explicitly selected city', async () => {
    vi.useFakeTimers();
    const load = vi.fn(); const onTick = vi.fn();
    const session = createCompanionWeatherSession({ onChange: () => {}, load });
    const stop = watchCompanionWeather(session, null, onTick);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(load).not.toHaveBeenCalled();
    expect(onTick).toHaveBeenCalledTimes(3);
    stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(onTick).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('clearing the city or cancelling prevents stale updates', async () => {
    const deferredWeather = deferred<WeatherSnapshot>();
    const states: CompanionWeatherState[] = [];
    const session = createCompanionWeatherSession({ onChange: value => states.push(value), now: () => now, load: () => deferredWeather.promise });
    const request = session.select(city);
    await session.select(null);
    deferredWeather.reject(new Error('late error')); await request;
    expect(states.at(-1)).toEqual({ kind: 'unknown', status: 'unset', error: '' });
    const pending = deferred<WeatherSnapshot>();
    const session2 = createCompanionWeatherSession({ onChange: value => states.push(value), now: () => now, load: () => pending.promise });
    const request2 = session2.select(city); session2.cancel();
    const count = states.length;
    pending.resolve(snapshot('storm')); await request2;
    expect(states).toHaveLength(count);
  });
});
