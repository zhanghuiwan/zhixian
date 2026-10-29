import { AppIcon as Ionicons } from '@/components/app-icon';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, type TextInputProps, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, radius, shadows, spacing, type ThemeColors } from '@/constants/theme';
import { GlassContent } from '@/components/glass';
import { CompanionView } from '@/components/companion';
import { useThemedStyles } from '@/context/appearance';

export function AppText({ children, variant = 'body', color, style, maxFontSizeMultiplier, ...props }: ComponentProps<typeof Text> & { variant?: 'body' | 'small' | 'label' | 'title' | 'heading' | 'word'; color?: string }) {
  const { styles } = useThemedStyles(createStyles);
  const scaleLimit = 2;
  return <Text {...props} maxFontSizeMultiplier={maxFontSizeMultiplier ?? scaleLimit} style={[styles.text, textVariants[variant], color ? { color } : null, style]}>{children}</Text>;
}

export function Brand({ compact = false }: { compact?: boolean }) {
  const { colors, styles } = useThemedStyles(createStyles);
  return <View style={styles.brand}><View style={[styles.brandMark, compact && styles.brandMarkCompact]}><Ionicons name="leaf" size={compact ? 17 : 21} color={colors.green} /></View><View><AppText variant={compact ? 'label' : 'heading'} style={styles.brandName}>知闲</AppText></View></View>;
}

export function Screen({ children, scroll = true, title, subtitle, right, refreshing, onRefresh }: { children: ReactNode; scroll?: boolean; title?: string; subtitle?: string; right?: ReactNode; refreshing?: boolean; onRefresh?: () => void }) {
  const { colors, styles } = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const header = title ? <View style={styles.pageHeader}><View style={styles.pageHeaderCopy}><AppText variant="title">{title}</AppText>{subtitle ? <AppText color={colors.inkSoft} style={styles.pageSubtitle}>{subtitle}</AppText> : null}</View>{right}</View> : null;
  if (!scroll) return <GlassContent style={{ flex: 1 }}><SafeAreaView style={styles.screen} edges={['top']}><View style={[styles.content, styles.fixedContent, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>{header}{children}</View></SafeAreaView></GlassContent>;
  return <GlassContent style={{ flex: 1 }}><SafeAreaView style={styles.screen} edges={['top']}><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.green} /> : undefined} contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 112, 132) }]}>{header}{children}</ScrollView></SafeAreaView></GlassContent>;
}

export function AuthScreen({ children }: { children: ReactNode }) {
  const { styles } = useThemedStyles(createStyles);
  return <GlassContent style={{ flex: 1 }}><SafeAreaView style={styles.authScreen}><KeyboardAvoidingView style={styles.authInner} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.authScroll}>{children}</ScrollView></KeyboardAvoidingView></SafeAreaView></GlassContent>;
}

export function Card({ children, style, muted = false }: { children: ReactNode; style?: object | object[]; muted?: boolean }) {
  const { styles } = useThemedStyles(createStyles); return <View style={[styles.card, muted && styles.cardMuted, style]}>{children}</View>; }
export function InsetGroup({ children, style }: { children: ReactNode; style?: object }) {
  const { styles } = useThemedStyles(createStyles); return <View style={[styles.insetGroup, style]}>{children}</View>; }

export function ListRow({ icon, iconTone = 'green', title, detail, value, onPress }: { icon: keyof typeof Ionicons.glyphMap; iconTone?: 'green' | 'gold' | 'neutral'; title: string; detail?: string; value?: string; onPress?: () => void }) {
  const { colors, styles } = useThemedStyles(createStyles);
  const content = <><View style={[styles.rowIcon, iconTone === 'gold' && styles.rowIconGold, iconTone === 'neutral' && styles.rowIconNeutral]}><Ionicons name={icon} size={20} color={iconTone === 'gold' ? colors.accentDark : colors.green} /></View><View style={styles.rowCopy}><AppText variant="label" >{title}</AppText>{detail ? <AppText variant="small" color={colors.muted} >{detail}</AppText> : null}</View>{value ? <AppText variant="small" color={colors.muted}>{value}</AppText> : null}{onPress ? <Ionicons name="chevron-forward" size={17} color={colors.muted} /> : null}</>;
  if (!onPress) return <View style={styles.listRow}>{content}</View>;
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.listRow, pressed && styles.rowPressed]}>{content}</Pressable>;
}

export function Button({ label, onPress, icon, variant = 'primary', disabled, loading, style }: { label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; disabled?: boolean; loading?: boolean; style?: object }) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { styles: buttonVariants } = useThemedStyles(createButtonVariants);
  const iconColor = variant === 'primary' ? colors.onPrimary : variant === 'danger' ? colors.danger : colors.green;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [styles.button, buttonVariants[variant], pressed && !disabled && styles.buttonPressed, (disabled || loading) && styles.buttonDisabled, style]}>{loading ? <ActivityIndicator size="small" color={iconColor} /> : <>{icon ? <Ionicons name={icon} size={18} color={iconColor} /> : null}<AppText variant="label" color={iconColor}>{label}</AppText></>}</Pressable>;
}

export function IconButton({ icon, label, onPress, active = false }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; active?: boolean }) {
  const { colors, styles } = useThemedStyles(createStyles); return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, active && styles.iconButtonActive, pressed && { opacity: 0.66 }]}><Ionicons name={icon} size={20} color={active ? colors.onPrimary : colors.green} /></Pressable>; }
export function TextField({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  const { colors, styles } = useThemedStyles(createStyles); return <View style={styles.field}><AppText variant="label">{label}</AppText><TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} maxFontSizeMultiplier={2} {...props} style={[styles.input, props.multiline && styles.inputMultiline, props.style]} />{error ? <AppText variant="small" color={colors.danger}>{error}</AppText> : null}</View>; }
export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  const { styles } = useThemedStyles(createStyles); return <View style={styles.sectionTitle}><AppText variant="heading">{title}</AppText>{action}</View>; }
export function Pill({ children, tone = 'green' }: { children: ReactNode; tone?: 'green' | 'terra' | 'neutral' }) {
  const { colors, styles } = useThemedStyles(createStyles); return <View style={[styles.pill, tone === 'terra' ? styles.pillGold : tone === 'neutral' ? styles.pillNeutral : null]}><AppText variant="small" color={tone === 'terra' ? colors.accentDark : tone === 'neutral' ? colors.inkSoft : colors.greenDark}>{children}</AppText></View>; }
export function ProgressBar({ value, tone = 'green' }: { value: number; tone?: 'green' | 'gold' }) {
  const { styles } = useThemedStyles(createStyles); return <View style={styles.progressTrack}><View style={[styles.progressFill, tone === 'gold' && styles.progressGold, { width: `${Math.max(0, Math.min(100, value))}%` }]} /></View>; }
export function Metric({ value, label }: { value: number | string; label: string }) {
  const { colors, styles } = useThemedStyles(createStyles); return <View style={styles.metric}><AppText variant="heading">{value}</AppText><AppText variant="small" color={colors.muted}>{label}</AppText></View>; }
export function Divider() {
  const { styles } = useThemedStyles(createStyles); return <View style={styles.divider} />; }
export function LoadingView({ label = '正在加载' }: { label?: string }) {
  const { colors, styles } = useThemedStyles(createStyles); return <View style={styles.state}><ActivityIndicator color={colors.green} /><AppText color={colors.muted}>{label}</AppText></View>; }
export function EmptyState({ icon = 'leaf-outline', title, message, action }: { icon?: keyof typeof Ionicons.glyphMap; title: string; message?: string; action?: ReactNode }) {
  const { colors, styles } = useThemedStyles(createStyles); return <View style={styles.state}><CompanionView size={120} /><View style={styles.stateIcon}><Ionicons name={icon} size={24} color={colors.green} /></View><AppText variant="heading">{title}</AppText>{message ? <AppText color={colors.muted} style={{ textAlign: 'center' }}>{message}</AppText> : null}{action}</View>; }
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) { return <EmptyState icon="cloud-offline-outline" title="暂时没有加载成功" message={message} action={onRetry ? <Button label="重新加载" onPress={onRetry} variant="secondary" /> : undefined} />; }

const textVariants = StyleSheet.create({
  body: { fontSize: 16, lineHeight: 25, fontWeight: '400' }, small: { fontSize: 13, lineHeight: 20, fontWeight: '400' },
  label: { fontSize: 15, lineHeight: 21, fontWeight: '600' }, title: { fontSize: 30, lineHeight: 37, fontWeight: '700' },
  heading: { fontSize: 19, lineHeight: 25, fontWeight: '700' }, word: { fontSize: 48, lineHeight: 58, fontWeight: '600' },
});
const createButtonVariants = (colors: ThemeColors) => StyleSheet.create({ primary: { backgroundColor: colors.green, borderColor: colors.green }, secondary: { backgroundColor: colors.surface, borderColor: colors.greenMuted }, ghost: { backgroundColor: 'transparent', borderColor: colors.border }, danger: { backgroundColor: colors.dangerPale, borderColor: colors.dangerPale } });
const createStyles = (colors: ThemeColors) => StyleSheet.create({
  text: { color: colors.ink, fontFamily: fonts.sans }, screen: { flex: 1, backgroundColor: colors.background }, content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 30 }, fixedContent: { flex: 1 },
  pageHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 22 }, pageHeaderCopy: { flex: 1, gap: 5 }, pageSubtitle: { maxWidth: 310 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 }, brandMark: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenPale }, brandMarkCompact: { width: 34, height: 34, borderRadius: 11 }, brandName: { letterSpacing: 0.5 },
  authScreen: { flex: 1, backgroundColor: colors.background }, authInner: { flex: 1 }, authScroll: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 22 },
  card: { padding: 20, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadows }, cardMuted: { backgroundColor: colors.surfaceMuted }, insetGroup: { overflow: 'hidden', borderRadius: radius.lg, backgroundColor: colors.surface, ...shadows },
  listRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, marginLeft: 16, paddingVertical: 13, paddingRight: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }, rowPressed: { opacity: 0.68, backgroundColor: colors.elevated },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenPale }, rowIconGold: { backgroundColor: colors.accentPale }, rowIconNeutral: { backgroundColor: colors.surfaceMuted }, rowCopy: { flex: 1, minWidth: 0, gap: 3 },
  button: { minHeight: 48, paddingHorizontal: 18, borderWidth: 1, borderRadius: radius.md, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }, buttonPressed: { opacity: 0.82, transform: [{ scale: 0.985 }] }, buttonDisabled: { opacity: 0.44 },
  iconButton: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted }, iconButtonActive: { backgroundColor: colors.green },
  field: { gap: 7 }, input: { minHeight: 48, paddingHorizontal: 14, borderWidth: 0, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, color: colors.ink, fontSize: 16 }, inputMultiline: { minHeight: 96, paddingTop: 13, textAlignVertical: 'top' },
  sectionTitle: { minHeight: 32, marginTop: 32, marginBottom: 14, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: colors.greenPale }, pillGold: { backgroundColor: colors.accentPale }, pillNeutral: { backgroundColor: colors.surfaceMuted },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.border }, progressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.green }, progressGold: { backgroundColor: colors.accent },
  metric: { gap: 3, alignItems: 'center' }, divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line }, state: { minHeight: 176, padding: 24, gap: 10, alignItems: 'center', justifyContent: 'center' }, stateIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenPale },
});
