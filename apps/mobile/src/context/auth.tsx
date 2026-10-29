import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, api, clearToken, getToken, setToken, subscribeUnauthorized } from '@/lib/api';
import type { User } from '@/lib/types';

type AuthContextValue = {
  user: User | null; loading: boolean; error: string; sessionExpired: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, nickname: string) => Promise<void>;
  logout: () => Promise<void>; refreshUser: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); const [sessionExpired, setSessionExpired] = useState(false);
  const refreshUser = useCallback(async () => {
    setLoading(true); setError('');
    try { const token = await getToken(); if (!token) { setUser(null); return; } setUser(await api<User>('/users/me')); }
    catch (cause) { if (cause instanceof ApiError && cause.status === 401) setUser(null); else setError(cause instanceof Error ? cause.message : '网络暂时不可用，请重试'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refreshUser(); }, [refreshUser]);
  useEffect(() => subscribeUnauthorized(() => { queryClient.clear(); setUser(null); setError(''); setSessionExpired(true); }), [queryClient]);
  const authenticate = useCallback(async (path: string, body: object) => { const result = await api<{ access_token: string; user: User }>(path, { method: 'POST', body: JSON.stringify(body) }); await setToken(result.access_token); setUser(result.user); setError(''); setSessionExpired(false); }, []);
  const value = useMemo<AuthContextValue>(() => ({ user, loading, error, sessionExpired, login: (email, password) => authenticate('/auth/login', { email, password }), register: (email, password, nickname) => authenticate('/auth/register', { email, password, nickname }), logout: async () => { await clearToken(); queryClient.clear(); setUser(null); setError(''); setSessionExpired(false); }, refreshUser }), [authenticate, error, loading, queryClient, refreshUser, sessionExpired, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used inside AuthProvider'); return value; }
