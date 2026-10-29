import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Animated, Easing, useWindowDimensions, View } from 'react-native';
import { useAppearance } from '@/context/appearance';
export function CompanionView({ size = 160, state = 'idle' }: { size?: number; state?: 'idle' | 'waiting' | 'success' }) {
  const { preferences, reduceMotion } = useAppearance(); const { width } = useWindowDimensions(); const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduceMotion || !preferences.companionEnabled) { opacity.setValue(1); return; }
    opacity.setValue(0.65); const transition = Animated.timing(opacity, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }); transition.start(); return () => transition.stop();
  }, [state, opacity, reduceMotion, preferences.companionEnabled]);
  if (!preferences.companionEnabled) return null;
  const height = width < 360 ? Math.min(size, 120) : size;
  return <Animated.View accessible={false} importantForAccessibility="no-hide-descendants" style={{ opacity, alignSelf: 'center' }}><View style={{ width: height * 1.2, height, alignItems: 'center' }}><Image source={require('../../assets/xianxian/neutral.png')} contentFit="contain" style={{ width: '100%', height: '100%' }} /></View></Animated.View>;
}
