"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, clearToken, getToken, setToken } from "@/lib/api";
import type { User } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, nickname: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const PUBLIC_PATHS = ["/login", "/register"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const refreshUser = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      return;
    }
    try {
      setUser(await api<User>("/users/me"));
    } catch {
      clearToken();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  useEffect(() => {
    if (loading) return;
    const isPublic = PUBLIC_PATHS.includes(pathname);
    if (!user && !isPublic) router.replace("/login");
    if (user && isPublic) router.replace("/dashboard");
  }, [loading, pathname, router, user]);

  const authenticate = async (path: string, body: object) => {
    const result = await api<{ access_token: string; user: User }>(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
    setToken(result.access_token);
    setUser(result.user);
    router.replace("/dashboard");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login: (email, password) => authenticate("/auth/login", { email, password }),
        register: (email, password, nickname) =>
          authenticate("/auth/register", { email, password, nickname }),
        logout: () => {
          clearToken();
          setUser(null);
          router.replace("/login");
        },
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
