import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://zhixian.zhanghuiwan.com/api/v1';
const TOKEN_KEY = 'zhixian_access_token';
type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();
let clearingUnauthorized = false;

export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function getToken() { return Platform.OS === 'web' ? globalThis.localStorage?.getItem(TOKEN_KEY) ?? null : SecureStore.getItemAsync(TOKEN_KEY); }
export async function setToken(token: string) { if (Platform.OS === 'web') globalThis.localStorage?.setItem(TOKEN_KEY, token); else await SecureStore.setItemAsync(TOKEN_KEY, token, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }); }
export async function clearToken() { if (Platform.OS === 'web') globalThis.localStorage?.removeItem(TOKEN_KEY); else await SecureStore.deleteItemAsync(TOKEN_KEY); }
export function subscribeUnauthorized(listener: UnauthorizedListener) { unauthorizedListeners.add(listener); return () => { unauthorizedListeners.delete(listener); }; }
export async function handleUnauthorized() {
  if (clearingUnauthorized) return;
  clearingUnauthorized = true;
  try { await clearToken(); unauthorizedListeners.forEach((listener) => listener()); }
  finally { clearingUnauthorized = false; }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let response: Response;
  try { response = await fetch(`${API_URL}${path}`, { ...init, headers }); }
  catch { throw new ApiError('无法连接服务器，请检查网络后重试', 0); }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) { if (response.status === 401) await handleUnauthorized(); throw new ApiError(data?.detail || (response.status === 401 ? '登录已过期，请重新登录' : '请求失败，请稍后重试'), response.status); }
  return data as T;
}

export interface SSEMessage { event: string; data: Record<string, unknown>; }
export async function streamApi(path: string, body: unknown, onEvent: (message: SSEMessage) => void, signal?: AbortSignal) {
  const token = await getToken();
  const response = await fetch(`${API_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal });
  if (!response.ok) { const data = await response.json().catch(() => null); if (response.status === 401) await handleUnauthorized(); throw new ApiError(data?.detail || (response.status === 401 ? '登录已过期，请重新登录' : 'AI 暂时无法回答'), response.status); }
  if (!response.body) throw new ApiError('当前设备不支持流式回答', 500);
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
  while (true) {
    const { value, done } = await reader.read(); buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
    const blocks = buffer.split('\n\n'); buffer = blocks.pop() || '';
    for (const block of blocks) { let event = 'message'; const lines: string[] = []; for (const line of block.split('\n')) { if (line.startsWith('event:')) event = line.slice(6).trim(); if (line.startsWith('data:')) lines.push(line.slice(5).trim()); } if (lines.length) onEvent({ event, data: JSON.parse(lines.join('\n')) }); }
    if (done) break;
  }
}
