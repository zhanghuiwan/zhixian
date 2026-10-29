import { BlurTargetView, BlurView } from 'expo-blur';
import { useFocusEffect } from 'expo-router';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { useAppearance } from '@/context/appearance';
type Target = RefObject<View | null> | undefined;
const GlassContext = createContext<{ target: Target; setTarget: (target: Target) => void }>({ target: undefined, setTarget: () => undefined });
export function GlassRoot({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Target>(); const value = useMemo(() => ({ target, setTarget }), [target]);
  return <GlassContext.Provider value={value}>{children}</GlassContext.Provider>;
}
// Only content is a target: navigation/composer remain siblings, preventing recursive blur.
export function GlassContent({ children, ...props }: ViewProps) {
  const ref = useRef<View>(null); const { setTarget } = useContext(GlassContext);
  useFocusEffect(useCallback(() => { setTarget(ref); return () => setTarget(undefined); }, [setTarget]));
  return <BlurTargetView ref={ref} {...props}>{children}</BlurTargetView>;
}
export function GlassSurface({ children, style, ...props }: ViewProps) {
  const { colors, scheme, reduceTransparency } = useAppearance(); const { target } = useContext(GlassContext);
  const blurSupported = Platform.OS !== 'android' || (Number(Platform.Version) >= 31 && !!target);
  const solid = reduceTransparency || !blurSupported;
  return <View {...props} style={[{ zIndex: 0, overflow: 'hidden', borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: solid ? colors.line : colors.glassBorder, backgroundColor: solid ? colors.surface : colors.glass }, style, { backgroundColor: solid ? colors.surface : 'transparent' }]}>
    {!solid && <BlurView pointerEvents="none" blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" intensity={32} tint={scheme === 'dark' ? 'dark' : 'light'} style={[StyleSheet.absoluteFill, { zIndex: -2 }]} />}
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: -1, backgroundColor: solid ? colors.surface : colors.glass }]} />{children}
  </View>;
}
