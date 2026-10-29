import { Pressable, Switch, View } from 'react-native';
import { AppText, Card } from '@/components/ui';
import { useAppearance } from '@/context/appearance';
import type { ThemePreference } from '@/lib/appearance';
export function AppearanceSettings() {
  const { preferences, update, colors } = useAppearance();
  return <Card style={{ marginTop: 24 }}><AppText variant="label">外观与陪伴</AppText><View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 16 }}>{([['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']] as [ThemePreference, string][]).map(([theme, label]) => <Pressable key={theme} accessibilityRole="radio" aria-checked={preferences.theme === theme} accessibilityState={{ checked: preferences.theme === theme }} onPress={() => update({ theme })} style={{ flexGrow: 1, minHeight: 48, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', borderRadius: 14, backgroundColor: preferences.theme === theme ? colors.greenPale : colors.surfaceMuted }}><AppText variant="label" color={preferences.theme === theme ? colors.greenDark : colors.muted}>{label}</AppText></Pressable>)}</View>
    {([{ key: 'companionEnabled', title: '显示闲闲', detail: '' }, { key: 'reduceMotion', title: '减少动态效果', detail: '系统设置优先' }, { key: 'reduceTransparency', title: '减少透明效果', detail: '' }] as const).map(({ key, title, detail }) => <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: 0.5, borderTopColor: colors.line }}><View style={{ flex: 1, gap: 4 }}><AppText variant="label">{title}</AppText>{detail ? <AppText variant="small" color={colors.muted}>{detail}</AppText> : null}</View><Switch accessibilityLabel={title} value={preferences[key]} onValueChange={(value) => update({ [key]: value })} trackColor={{ false: colors.border, true: colors.green }} thumbColor={colors.surface} /></View>)}
  </Card>;
}
