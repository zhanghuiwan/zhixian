import { AppIcon as Ionicons } from '@/components/app-icon';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, EmptyState, ErrorState, IconButton, LoadingView, ProgressBar, Screen, SectionTitle } from '@/components/ui';
import { radius, shadows, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/context/appearance';
import { api } from '@/lib/api';
import type { Article } from '@/lib/types';

function ArticleRow({ article, index }: { article: Article; index: number }) {
  const { colors, styles } = useThemedStyles(createStyles);
  return <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/article/[id]', params: { id: article.id } })} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <View style={[styles.thumb, index % 3 === 1 && styles.thumbGold, index % 3 === 2 && styles.thumbNeutral]}><Ionicons name={article.topic?.includes('科技') ? 'hardware-chip-outline' : 'reader-outline'} size={22} color={index % 3 === 1 ? colors.accentDark : colors.green} /></View>
    <View style={styles.rowCopy}><AppText variant="label" numberOfLines={2}>{article.title}</AppText><AppText variant="small" color={colors.muted} numberOfLines={1}>{article.level} · {article.read_minutes} 分钟{article.is_private ? ' · 我的文章' : ''}</AppText>{article.progress > 0 ? <ProgressBar value={article.progress} /> : null}</View>
    <View style={styles.rowEnd}><AppText variant="small" color={article.is_completed ? colors.green : colors.muted}>{article.is_completed ? '已读完' : article.progress ? `${article.progress}%` : '开始'}</AppText><Ionicons name="chevron-forward" size={17} color={colors.muted} /></View>
  </Pressable>;
}

export default function ArticlesScreen() {
  const { colors, styles } = useThemedStyles(createStyles);
  const articles = useQuery({ queryKey: ['articles'], queryFn: () => api<Article[]>('/articles') });
  if (articles.isLoading) return <Screen title="阅读"><LoadingView label="正在整理文章" /></Screen>;
  if (articles.error) return <Screen title="阅读"><ErrorState message={(articles.error as Error).message} onRetry={() => articles.refetch()} /></Screen>;
  const [featured, ...rest] = articles.data ?? [];
  return <Screen title="阅读" right={<IconButton icon="close" label="关闭" onPress={() => router.back()} />} refreshing={articles.isFetching} onRefresh={() => articles.refetch()}>
    {!featured ? <EmptyState icon="reader-outline" title="还没有文章" message="可以让闲闲根据你的学习进度推荐一篇。" /> : <>
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/article/[id]', params: { id: featured.id } })} style={({ pressed }) => [styles.feature, pressed && styles.pressed]}>
        <View style={styles.featureTop}><View style={styles.featureIcon}><Ionicons name="book-outline" size={24} color={colors.green} /></View><View style={styles.featureMeta}><AppText variant="small" color={colors.green}>精选文章</AppText><AppText variant="small" color={colors.muted}>{featured.level} · {featured.read_minutes} 分钟</AppText></View><Ionicons name="arrow-forward" size={20} color={colors.green} /></View>
        <AppText style={styles.featureTitle} numberOfLines={3}>{featured.title}</AppText>
        {featured.title_zh ? <AppText color={colors.inkSoft} numberOfLines={1}>{featured.title_zh}</AppText> : null}
        <View style={styles.featureBottom}><View style={{ flex: 1 }}><ProgressBar value={featured.progress} /></View><AppText variant="small" color={colors.green}>{featured.progress ? `继续 · ${featured.progress}%` : '开始阅读'}</AppText></View>
      </Pressable>

      {rest.length ? <><SectionTitle title="全部文章" /><View style={styles.list}>{rest.map((article, index) => <ArticleRow key={article.id} article={article} index={index} />)}</View></> : null}
    </>}
  </Screen>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  feature: { minHeight: 218, padding: 20, gap: 12, borderRadius: radius.lg, backgroundColor: colors.greenPale, ...shadows },
  featureTop: { flexDirection: 'row', alignItems: 'center', gap: 11 }, featureIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  featureMeta: { flex: 1, gap: 2 }, featureTitle: { marginTop: 9, fontSize: 26, lineHeight: 32, fontWeight: '700', color: colors.ink },
  featureBottom: { marginTop: 'auto', flexDirection: 'row', alignItems: 'center', gap: 12 },
  list: { overflow: 'hidden', borderRadius: radius.lg, backgroundColor: colors.surface, ...shadows },
  row: { minHeight: 92, marginLeft: 16, paddingVertical: 13, paddingRight: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  thumb: { width: 48, height: 58, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenPale }, thumbGold: { backgroundColor: colors.accentPale }, thumbNeutral: { backgroundColor: colors.surfaceMuted },
  rowCopy: { flex: 1, minWidth: 0, gap: 5 }, rowEnd: { alignItems: 'flex-end', gap: 6 }, pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
