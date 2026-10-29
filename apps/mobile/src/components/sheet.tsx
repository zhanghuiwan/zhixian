import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassSurface } from '@/components/glass';
// Keyboard avoidance belongs to the full modal viewport, not the bottom-aligned panel.
export function SheetHost({ children }: ViewProps) {
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>{children}</KeyboardAvoidingView>;
}
// A common scrollable glass sheet keeps forms reachable above the keyboard at large font sizes.
export function Sheet({ children, style }: ViewProps) {
  const insets = useSafeAreaInsets();
  return <View style={{ maxHeight: '90%', width: '100%', flexShrink: 1 }}><GlassSurface style={[{ borderTopLeftRadius: 24, borderTopRightRadius: 24, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }, style, { maxHeight: '100%', flexShrink: 1 }]}><ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}><Pressable accessibilityViewIsModal onPress={(event) => event.stopPropagation()}><View style={{ gap: 14, paddingBottom: Math.max(insets.bottom, 12) }}>{children}</View></Pressable></ScrollView></GlassSurface></View>;
}
