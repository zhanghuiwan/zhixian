import { Sheet, SheetHost } from '@/components/sheet';
import { AppIcon as Ionicons } from '@/components/app-icon';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AppText, Button, EmptyState, ErrorState, IconButton, LoadingView, Screen, TextField } from '@/components/ui';
import { radius, shadows, type ThemeColors } from '@/constants/theme';
import { useAppearance, useThemedStyles } from '@/context/appearance';
import { api } from '@/lib/api';
import { speakEnglish } from '@/lib/speech';
import type { SentenceBookmark } from '@/lib/types';

interface SentencePage { items: SentenceBookmark[]; total: number; offset: number }

export default function SentencesScreen() {
  const { reduceMotion } = useAppearance();
  const { colors, styles } = useThemedStyles(createStyles);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [text, setText] = useState('');
  const [translation, setTranslation] = useState('');
  const client = useQueryClient();
  const sentences = useQuery({ queryKey: ['sentences', query], queryFn: () => api<SentencePage>(`/sentences?q=${encodeURIComponent(query)}&source=all`) });
  const create = useMutation({ mutationFn: () => api('/sentences', { method: 'POST', body: JSON.stringify({ text, translation }) }), onSuccess: () => { setCreating(false); setText(''); setTranslation(''); client.invalidateQueries({ queryKey: ['sentences'] }); } });
  const remove = useMutation({ mutationFn: (id: number) => api(`/sentences/${id}`, { method: 'DELETE' }), onSuccess: () => client.invalidateQueries({ queryKey: ['sentences'] }) });
  if (sentences.isLoading) return <Screen title="句子收藏"><LoadingView /></Screen>;
  if (sentences.error) return <Screen title="句子收藏"><ErrorState message={(sentences.error as Error).message} onRetry={() => sentences.refetch()} /></Screen>;

  return <>
    <Screen title="句子收藏" subtitle={`${sentences.data?.total ?? 0} 条`} right={<IconButton icon="close" label="关闭" onPress={() => router.back()} />} refreshing={sentences.isFetching} onRefresh={() => sentences.refetch()}>
      <View style={styles.toolbar}><View style={styles.search}><Ionicons name="search-outline" size={19} color={colors.muted} /><TextInput value={query} onChangeText={setQuery} accessibilityLabel="搜索原文或译文" placeholder="搜索原文或译文" placeholderTextColor={colors.muted} style={styles.searchInput} /></View><Pressable accessibilityRole="button" accessibilityLabel="添加句子" onPress={() => setCreating(true)} style={styles.add}><Ionicons name="add" size={22} color={colors.onPrimary} /></Pressable></View>
      <View style={styles.list}>{sentences.data?.items.map((item, index) => <View key={item.id} style={[styles.card, index < sentences.data!.items.length - 1 && styles.cardDivider]}>
        <View style={styles.meta}><View style={[styles.source, item.is_example && styles.sourceGold]}><AppText variant="small" color={item.is_example ? colors.accentDark : colors.green}>{item.is_example ? '示例' : item.source_type === 'article' ? '文章' : item.source_type === 'ai' ? '闲闲' : '手动'}</AppText></View><AppText variant="small" color={colors.muted}>{item.article_title || new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(item.created_at))}</AppText></View>
        <View style={styles.quoteLine}><Ionicons name="chatbox-ellipses-outline" size={18} color={colors.green} style={styles.quoteIcon} /><AppText selectable style={styles.quote}>{item.text}</AppText></View>
        {item.translation ? <AppText color={colors.inkSoft}>{item.translation}</AppText> : null}
        {item.note ? <View style={styles.note}><AppText variant="small" color={colors.muted}>笔记 · {item.note}</AppText></View> : null}
        <View style={styles.actions}><Pressable accessibilityRole="button" onPress={() => speakEnglish(item.text)} style={styles.action}><Ionicons name="volume-high-outline" size={16} color={colors.green} /><AppText variant="small" color={colors.green}>朗读</AppText></Pressable>{item.article_id ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/article/[id]', params: { id: item.article_id! } })} style={styles.action}><Ionicons name="book-outline" size={16} color={colors.green} /><AppText variant="small" color={colors.green}>出处</AppText></Pressable> : null}<Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/', params: { prompt: `请解释这个句子，并给我一个能实际使用的例子：${item.text}` } })} style={styles.action}><Ionicons name="leaf-outline" size={16} color={colors.green} /><AppText variant="small" color={colors.green}>问闲闲</AppText></Pressable><Pressable accessibilityRole="button" onPress={() => remove.mutate(item.id)} style={styles.action}><Ionicons name="trash-outline" size={16} color={colors.danger} /><AppText variant="small" color={colors.danger}>删除</AppText></Pressable></View>
      </View>)}</View>
      {!sentences.data?.items.length ? <EmptyState icon="chatbox-outline" title={query ? '没有匹配的收藏' : '还没有收藏句子'} message={query ? '换一个关键词试试看。' : '阅读时收藏整句，也可以手动添加。'} /> : null}
    </Screen>

    <Modal visible={creating} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={() => setCreating(false)}><SheetHost><Pressable style={styles.overlay} onPress={() => setCreating(false)}><Sheet style={styles.sheet}><View style={styles.grabber} /><AppText variant="heading">添加句子</AppText><TextField label="英文原文" value={text} onChangeText={setText} multiline autoFocus /><TextField label="中文译文（可选）" value={translation} onChangeText={setTranslation} multiline /><Button label="保存收藏" onPress={() => create.mutate()} disabled={!text.trim()} loading={create.isPending} />{create.error ? <AppText color={colors.danger}>{(create.error as Error).message}</AppText> : null}</Sheet></Pressable></SheetHost></Modal>
  </>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  toolbar: { flexDirection: 'row', gap: 10 }, search: { flex: 1, height: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: radius.md, backgroundColor: colors.surfaceMuted }, searchInput: { flex: 1, color: colors.ink, fontSize: 15 }, add: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green },
  list: { marginTop: 16, paddingHorizontal: 18, overflow: 'hidden', borderRadius: radius.lg, backgroundColor: colors.surface, ...shadows }, card: { paddingVertical: 18, gap: 11 }, cardDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, source: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, backgroundColor: colors.greenPale }, sourceGold: { backgroundColor: colors.accentPale },
  quoteLine: { flexDirection: 'row', gap: 10 }, quoteIcon: { marginTop: 4 }, quote: { flex: 1, fontSize: 18, lineHeight: 28, fontWeight: '500' },
  note: { padding: 10, borderRadius: radius.md, backgroundColor: colors.accentPale }, actions: { paddingTop: 4, flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, action: { minHeight: 44, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay }, sheet: { padding: 24, paddingBottom: 34, gap: 16, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.background }, grabber: { width: 38, height: 4, alignSelf: 'center', borderRadius: 2, backgroundColor: colors.border },
});
