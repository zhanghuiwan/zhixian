import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/context/auth';
import { AppearanceProvider, useAppearance } from '@/context/appearance';
import { GlassRoot } from '@/components/glass';
import { ErrorState } from '@/components/ui';
function RouterGate() {
  const { user, loading, error, refreshUser } = useAuth(); const segments = useSegments(); const router = useRouter(); const { colors, scheme, ready, reduceMotion } = useAppearance();
  useEffect(() => { if (loading || (!user && error)) return; const inAuth = segments[0] === 'login' || segments[0] === 'register'; if (!user && !inAuth) router.replace('/login'); if (user && inAuth) router.replace('/'); }, [error, loading, router, segments, user]);
  return <><StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />{loading || !ready ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.green} size="large" /></View> : !user && error ? <View style={{ flex: 1, padding: 24, backgroundColor: colors.background }}><ErrorState message={error} onRetry={() => void refreshUser()} /></View> : <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: reduceMotion ? 'none' : 'slide_from_right' }} />}</>;
}
export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }));
  return <SafeAreaProvider><AppearanceProvider><QueryClientProvider client={queryClient}><AuthProvider><GlassRoot><RouterGate /></GlassRoot></AuthProvider></QueryClientProvider></AppearanceProvider></SafeAreaProvider>;
}
