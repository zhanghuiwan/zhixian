import { StudyDock } from '@/components/study-dock';
import { AppIcon as Ionicons } from '@/components/app-icon';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Button, ErrorState, LoadingView, ProgressBar, Screen, SectionTitle } from '@/components/ui';
import { radius, shadows, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/context/appearance';
import { api } from '@/lib/api';
import type { Dashboard } from '@/lib/types';

function ModeRow({ icon, title, tone = 'green', last = false, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; tone?: 'green' | 'gold' | 'neutral'; last?: boolean; onPress: () => void }) {
  const { colors, styles } = useThemedStyles(createStyles);
  const gold = tone === 'gold';
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.modeRow, !last && styles.rowDivider, pressed && styles.pressed]}>
    <View style={[styles.modeIcon, gold && styles.modeIconGold, tone === 'neutral' && styles.modeIconNeutral]}><Ionicons name={icon} size={21} color={gold ? colors.accentDark : colors.green} /></View>
    <View style={styles.modeCopy}><AppText variant="label">{title}</AppText></View>
    <Ionicons name="arrow-forward" size={18} color={gold ? colors.accentDark : colors.green} />
  </Pressable>;
}

function ResourceCard({ icon, title, value, tone = 'green', onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; value: string; tone?: 'green' | 'gold'; onPress: () => void }) {
  const { colors, styles } = useThemedStyles(createStyles);
  const gold = tone === 'gold';
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.resource, pressed && styles.pressed]}>
    <View style={[styles.resourceIcon, gold && styles.resourceIconGold]}><Ionicons name={icon} size={21} color={gold ? colors.accentDark : colors.green} /></View>
    <View style={styles.resourceCopy}><View style={styles.resourceTitle}><AppText variant="label">{title}</AppText>{value ? <AppText variant="small" color={gold ? colors.accentDark : colors.green} numberOfLines={1}>{value}</AppText> : null}</View></View>
    <Ionicons name="chevron-forward" size={17} color={colors.muted} />
  </Pressable>;
}

export default function StudyScreen() {
  const { colors, styles } = useThemedStyles(createStyles);
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard') });
  const refresh = () => { dashboard.refetch(); };
  if (dashboard.isLoading) return <Screen title="学习"><LoadingView label="正在准备学习任务" /></Screen>;
  if (dashboard.error) return <Screen title="学习"><ErrorState message={((dashboard.error) as Error).message} onRetry={refresh} /></Screen>;

  const book = dashboard.data?.current_wordbook;
  const learned = book?.learned_count ?? 0;
  const total = book?.word_count ?? 0;
  const progress = total ? learned / total * 100 : 0;

  return <Screen title="学习" refreshing={dashboard.isFetching} onRefresh={refresh}>
    <StudyDock />
    <View style={[styles.planCard, { marginTop: 24 }]}>
      <View style={styles.planHead}>
        <View style={styles.planLabel}><Ionicons name="book-outline" size={17} color={colors.green} /><AppText variant="small" color={colors.green}>当前词书</AppText></View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/wordbooks')} style={styles.switchBook}><AppText variant="small" color={colors.green}>切换词书</AppText><Ionicons name="chevron-forward" size={15} color={colors.green} /></Pressable>
      </View>
      <View style={[styles.planHero, { minHeight: 60 }]}>
        <View style={styles.bookCopy}><AppText style={styles.bookName} numberOfLines={2}>{book?.name ?? '还没有选择词书'}</AppText></View>
      </View>
      <View style={styles.progressMeta}><AppText variant="small" color={colors.inkSoft}>{book ? `已学 ${learned} / ${total}` : '选择一本词书后开始学习'}</AppText><AppText variant="small" color={colors.green}>{Math.round(progress)}%</AppText></View>
      <ProgressBar value={progress} />
      <View style={{ marginTop: 20 }}><Button label={book ? "开始学习" : "选择词书"} icon="arrow-forward" onPress={() => book ? router.push({ pathname: "/learn", params: { mode: "all" } }) : router.push("/wordbooks")} /></View>
      <View style={styles.todayMeta}><View><AppText style={styles.todayNumber}>{dashboard.data?.studied_today ?? 0}</AppText><AppText variant="small" color={colors.muted}>今日已学</AppText></View><View style={styles.todayDivider} /><View><AppText style={styles.todayNumber}>{dashboard.data?.mastered_words ?? 0}</AppText><AppText variant="small" color={colors.muted}>累计掌握</AppText></View></View>
    </View>

    <SectionTitle title="词汇学习" />
    <View style={styles.resources}>
      <ResourceCard icon="library-outline" title="学习词书" value="" onPress={() => router.push('/wordbooks')} />
      <ResourceCard icon="bookmark-outline" title="生词本" value={`${dashboard.data?.vocabulary_count ?? 0} 词`} onPress={() => router.push('/vocabulary')} />
    </View>
    <SectionTitle title="阅读与收藏" />
    <View style={styles.modeGroup}>
      <ModeRow icon="reader-outline" title="文章阅读" onPress={() => router.push('/articles')} />
      <ModeRow icon="chatbox-ellipses-outline" title="收藏句子" last onPress={() => router.push('/sentences')} />
    </View>
  </Screen>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  planCard: { padding: 22, gap: 16, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadows },
  planHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  planLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  switchBook: { minHeight: 32, paddingLeft: 10, flexDirection: 'row', alignItems: 'center', gap: 2 },
  planHero: { minHeight: 104, flexDirection: 'row', alignItems: 'center' }, bookCopy: { width: '100%', gap: 9 },
  bookName: { fontSize: 26, lineHeight: 33, fontWeight: '700', color: colors.ink },
  progressMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  todayMeta: { marginTop: 5, paddingTop: 13, flexDirection: 'row', alignItems: 'center', gap: 22, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  todayNumber: { fontSize: 20, lineHeight: 24, fontWeight: '700', color: colors.ink },
  todayDivider: { width: StyleSheet.hairlineWidth, height: 34, backgroundColor: colors.line },
  taskList: { overflow: 'hidden', borderRadius: radius.lg, backgroundColor: colors.surface, ...shadows },
  taskButton: { minHeight: 64, marginLeft: 16, paddingVertical: 13, paddingRight: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  taskIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenPale },
  taskIconReview: { backgroundColor: colors.accentPale }, taskCopy: { flex: 1, gap: 1 }, taskCount: { flexDirection: 'row', alignItems: 'baseline' }, taskNumber: { fontSize: 24, lineHeight: 28, fontWeight: '700', color: colors.ink },
  modeGroup: { overflow: 'hidden', borderRadius: radius.lg, backgroundColor: colors.surface, ...shadows },
  modeRow: { minHeight: 64, marginLeft: 16, paddingVertical: 13, paddingRight: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  modeIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenPale }, modeIconGold: { backgroundColor: colors.accentPale }, modeIconNeutral: { backgroundColor: colors.surfaceMuted },
  modeCopy: { flex: 1, minWidth: 0, gap: 3 }, rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  resources: { overflow: 'hidden', borderRadius: radius.lg, backgroundColor: colors.surface, ...shadows },
  resource: { minHeight: 64, marginLeft: 16, paddingVertical: 13, paddingRight: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  resourceIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenPale }, resourceIconGold: { backgroundColor: colors.accentPale },
  resourceCopy: { flex: 1, minWidth: 0, gap: 3 }, resourceTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
