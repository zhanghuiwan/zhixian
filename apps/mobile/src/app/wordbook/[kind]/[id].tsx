import { Sheet, SheetHost } from '@/components/sheet';
import { AppIcon as Ionicons } from '@/components/app-icon';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AppText, Button, EmptyState, ErrorState, IconButton, LoadingView, Pill, ProgressBar, Screen, TextField } from '@/components/ui';
import { radius, shadows, type ThemeColors } from '@/constants/theme';
import { useAppearance, useThemedStyles } from '@/context/appearance';
import { api } from '@/lib/api';
import { speakEnglish } from '@/lib/speech';
import type { AddTermsResult, BookDetail, Wordbook } from '@/lib/types';

const stateLabel: Record<string, string> = { new: '未学习', learning: '学习中', mastered: '已掌握' };

export default function WordbookDetailScreen() {
  const { reduceMotion } = useAppearance();
  const { colors, styles } = useThemedStyles(createStyles);
  const params = useLocalSearchParams<{ kind: string; id: string }>();
  const kind = params.kind === 'personal' ? 'personal' : 'system';
  const id = Number(params.id);
  const client = useQueryClient();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [terms, setTerms] = useState('');
  const [notice, setNotice] = useState('');
  const detail = useQuery({ queryKey: ['library-detail', kind, id], queryFn: () => api<BookDetail>(`/library/${kind}/${id}?limit=100`), enabled: Number.isFinite(id) });
  const select = useMutation({ mutationFn: () => api<Wordbook>(`/library/${kind}/${id}/select`, { method: 'POST' }), onSuccess: () => { setNotice('已设为当前学习词书'); client.invalidateQueries({ queryKey: ['library'] }); client.invalidateQueries({ queryKey: ['dashboard'] }); client.invalidateQueries({ queryKey: ['library-detail', kind, id] }); } });
  const add = useMutation({
    mutationFn: () => api<AddTermsResult>(`/library/personal/${id}/words`, { method: 'POST', body: JSON.stringify({ terms: terms.split(/[\s,，;；]+/).filter(Boolean) }) }),
    onSuccess: (result) => { const missing = result.missing.length ? `，${result.missing.join('、')} 未在词库中` : ''; setNotice(`已加入 ${result.added} 个，已有 ${result.existing} 个${missing}`); setAdding(false); setTerms(''); client.invalidateQueries({ queryKey: ['library'] }); client.invalidateQueries({ queryKey: ['library-detail', kind, id] }); client.invalidateQueries({ queryKey: ['vocabulary'] }); },
  });
  const remove = useMutation({ mutationFn: (wordId: number) => api(`/library/personal/${id}/words/${wordId}`, { method: 'DELETE' }), onSuccess: () => { setNotice('已从这本词书移出'); client.invalidateQueries({ queryKey: ['library'] }); client.invalidateQueries({ queryKey: ['library-detail', kind, id] }); } });
  const words = useMemo(() => detail.data?.words.filter((item) => !query.trim() || `${item.word.term} ${item.word.translation}`.toLowerCase().includes(query.trim().toLowerCase())) ?? [], [detail.data?.words, query]);
  if (detail.isLoading) return <Screen><LoadingView label="正在打开词书" /></Screen>;
  if (detail.error || !detail.data) return <Screen><ErrorState message={(detail.error as Error)?.message || '词书不存在'} onRetry={() => detail.refetch()} /></Screen>;
  const book = detail.data.book;
  return <>
    <Screen title={book.name} subtitle={book.description || undefined} right={<IconButton icon="close" label="关闭词书" onPress={() => router.back()} />} refreshing={detail.isFetching} onRefresh={() => detail.refetch()}>
      <View style={styles.summary}><View style={styles.summaryTop}><View><AppText variant="heading">{book.learned_count} / {book.word_count}</AppText><AppText variant="small" color={colors.muted}>已学习 · {book.mastered_count} 个已掌握</AppText></View><Pill tone={kind === 'personal' ? 'terra' : 'green'}>{kind === 'personal' ? '我的词书' : '系统词书'}</Pill></View><ProgressBar value={book.word_count ? book.learned_count / book.word_count * 100 : 0} /><View style={styles.summaryActions}><Button label="开始学习" icon="play" onPress={() => router.push({ pathname: '/learn', params: { kind, sourceId: id } })} style={{ flex: 1 }} />{!book.is_selected ? <Button label="设为当前" variant="secondary" loading={select.isPending} onPress={() => select.mutate()} style={{ flex: 1 }} /> : null}</View></View>
      {notice ? <View style={styles.notice}><Ionicons name="checkmark-circle" size={18} color={colors.green} /><AppText variant="small" color={colors.green} style={{ flex: 1 }}>{notice}</AppText></View> : null}
      <View style={styles.toolbar}><View style={styles.search}><Ionicons name="search-outline" size={18} color={colors.muted} /><TextInput value={query} onChangeText={setQuery} accessibilityLabel="搜索这本词书" placeholder="搜索这本词书" placeholderTextColor={colors.muted} style={styles.searchInput} /></View>{kind === 'personal' ? <Pressable accessibilityRole="button" accessibilityLabel="向词书添加单词" onPress={() => setAdding(true)} style={styles.addButton}><Ionicons name="add" size={22} color={colors.onPrimary} /></Pressable> : null}</View>
      {words.length ? <View style={styles.list}>{words.map((item) => <View key={item.word.id} style={styles.row}><Pressable accessibilityRole="button" accessibilityLabel={`朗读 ${item.word.term}`} onPress={() => speakEnglish(item.word.term)} style={styles.sound}><Ionicons name="volume-high-outline" size={18} color={colors.green} /></Pressable><View style={styles.copy}><View style={styles.termLine}><AppText variant="label">{item.word.term}</AppText><AppText variant="small" color={item.status === 'mastered' ? colors.green : colors.muted}>{stateLabel[item.status] || item.status}</AppText></View><AppText color={colors.inkSoft} numberOfLines={2}>{item.word.translation}</AppText><ProgressBar value={item.mastery_score} /></View>{kind === 'personal' ? <Pressable accessibilityRole="button" accessibilityLabel="从这本词书移出" onPress={() => remove.mutate(item.word.id)} style={styles.remove}><Ionicons name="remove-circle-outline" size={20} color={colors.muted} /></Pressable> : null}</View>)}</View> : <EmptyState icon="albums-outline" title={query ? '没有匹配的单词' : '这本词书还是空的'} message={query ? '换一个关键词试试看。' : ''} />}
    </Screen>
    <Modal visible={adding} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={() => setAdding(false)}><SheetHost><Pressable style={styles.overlay} onPress={() => setAdding(false)}><Sheet style={styles.sheet}><View style={styles.grabber} /><AppText variant="heading">向词书添加单词</AppText><AppText color={colors.muted}>输入词库中已有的英文单词，用空格、逗号或换行分隔。</AppText><TextField label="单词" value={terms} onChangeText={setTerms} multiline autoCapitalize="none" autoCorrect={false} autoFocus placeholder="serene, curious, wander" /><Button label="加入词书" onPress={() => add.mutate()} disabled={!terms.trim()} loading={add.isPending} />{add.error ? <AppText variant="small" color={colors.danger}>{(add.error as Error).message}</AppText> : null}</Sheet></Pressable></SheetHost></Modal>
  </>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  summary: { padding: 18, gap: 13, borderRadius: radius.lg, backgroundColor: colors.greenPale, ...shadows }, summaryTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }, summaryActions: { flexDirection: 'row', gap: 9 },
  notice: { minHeight: 44, marginTop: 12, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: radius.md, backgroundColor: colors.greenPale },
  toolbar: { marginTop: 18, flexDirection: 'row', gap: 9 }, search: { flex: 1, height: 48, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.md, backgroundColor: colors.surfaceMuted }, searchInput: { flex: 1, color: colors.ink, fontSize: 15 }, addButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.green },
  list: { marginTop: 14, overflow: 'hidden', borderRadius: radius.lg, backgroundColor: colors.surface, ...shadows }, row: { minHeight: 94, marginLeft: 14, paddingVertical: 12, paddingRight: 8, flexDirection: 'row', alignItems: 'flex-start', gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }, sound: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenPale }, copy: { flex: 1, minWidth: 0, gap: 6 }, termLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay }, sheet: { paddingHorizontal: 22, paddingBottom: 34, gap: 15, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.background }, grabber: { width: 38, height: 4, alignSelf: 'center', marginTop: 9, borderRadius: 2, backgroundColor: colors.border },
});
