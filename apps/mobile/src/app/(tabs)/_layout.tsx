import { AppIcon as Ionicons } from '@/components/app-icon';
import { Tabs, type BottomTabBarButtonProps } from 'expo-router/js-tabs';
import { Image, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppearance } from '@/context/appearance';

function TabButton({ children, style, onPress, onLongPress, testID, accessibilityLabel, 'aria-label': ariaLabel, 'aria-selected': selected }: BottomTabBarButtonProps) {
  // Keep navigation semantics without Android's unbounded platform ripple.
  return <Pressable accessibilityRole="tab" accessibilityLabel={ariaLabel ?? accessibilityLabel} aria-selected={selected} accessibilityState={{ selected: !!selected }} onPress={onPress} onLongPress={onLongPress} testID={testID} style={({ pressed }) => [style, { opacity: pressed ? 0.72 : 1 }]}>{children}</Pressable>;
}

export default function TabsLayout() {
  const { colors } = useAppearance(); const insets = useSafeAreaInsets();
  const height = 64;
  const icon = (name: keyof typeof Ionicons.glyphMap, focused: boolean) => <View style={{ width: 48, height: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={name} size={28} color={focused ? colors.ink : colors.muted} /></View>;
  return <Tabs initialRouteName="index" screenOptions={{ headerShown: false, animation: 'none', tabBarButton: (props) => <TabButton {...props} />, tabBarHideOnKeyboard: true, tabBarShowLabel: false, tabBarActiveTintColor: colors.ink, tabBarInactiveTintColor: colors.muted,
    tabBarStyle: { position: 'absolute', left: 0, right: 0, bottom: 0, height: height + insets.bottom, paddingTop: 8, paddingBottom: 8 + insets.bottom, borderTopWidth: 0.5, borderTopColor: colors.line, backgroundColor: colors.background, elevation: 0 },
    tabBarLabelStyle: { fontSize: 12, fontWeight: '500' }, tabBarItemStyle: { borderRadius: 30 },
  }}>
    <Tabs.Screen name="study" options={{ title: '学习', tabBarAccessibilityLabel: '学习', tabBarIcon: ({ focused }) => icon(focused ? 'book' : 'book-outline', focused) }} />
    <Tabs.Screen name="index" options={{ title: '闲闲', tabBarAccessibilityLabel: '闲闲', tabBarIcon: ({ focused }) => <Image accessible={false} source={require('../../../assets/icons/wutong-tab-line.png')} resizeMode="contain" style={{ width: 28, height: 28, tintColor: focused ? colors.ink : colors.muted }} /> }} />
    <Tabs.Screen name="profile" options={{ title: '我的', tabBarAccessibilityLabel: '我的', tabBarIcon: ({ focused }) => icon(focused ? 'person' : 'person-outline', focused) }} />
    <Tabs.Screen name="records" options={{ href: null, tabBarStyle: { display: 'none' } }} />
  </Tabs>;
}
