import { Sheet, SheetHost } from '@/components/sheet';
import { AppIcon as Ionicons } from '@/components/app-icon';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AppText, Button, EmptyState, ErrorState, IconButton, LoadingView, ProgressBar, Screen, SectionTitle, TextField } from '@/components/ui';
import { radius, shadows, type ThemeColors } from '@/constants/theme';
import { useAppearance, useThemedStyles } from '@/context/appearance';
import { api } from '@/lib/api';
import type { Wordbook } from '@/lib/types';

function BookRow({ book, onOpen }: { book: Wordbook; onOpen: () => void }) {
  const { colors, styles } = useThemedStyles(createStyles);
  return <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [styles.bookRow, pressed && styles.pressed]}>
    <View style={[styles.bookGlyph, book.kind === 'personal' && styles.bookGlyphGold]}><Ionicons name={book.kind === 'personal' ? 'list-outline' : 'book-outline'} size={20} color={book.kind === 'personal' ? colors.accentDark : colors.green} /></View>
    <View style={styles.rowCopy}><View style={styles.rowTitle}><AppText variant="label" numberOfLines={1} style={{ flex: 1 }}>{book.name}</AppText>{book.is_selected ? <View style={styles.currentPill}><AppText variant="small" color={colors.green}>当前</AppText></View> : null}</View><AppText variant="small" color={colors.muted}>{book.word_count} 词 · 已学 {book.learned_count}</AppText></View>
    <Ionicons name="chevron-forward" size={17} color={colors.muted} />
  </Pressable>;
}

export default function WordbooksScreen() {
  const { reduceMotion } = useAppearance();
  const { colors, styles } = useThemedStyles(createStyles);
  const client = useQueryClient();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const books = useQuery({ queryKey: ['library'], queryFn: () => api<Wordbook[]>('/library') });
  const create = useMutation({ mutationFn: () => api<Wordbook>('/library/personal', { method: 'POST', body: JSON.stringify({ name: name.trim(), description: description.trim() }) }), onSuccess: () => { setCreating(false); setName(''); setDescription(''); client.invalidateQueries({ queryKey: ['library'] }); } });
  const filtered = useMemo(() => books.data?.filter((book) => !query.trim() || `${book.name} ${book.description}`.toLowerCase().includes(query.trim().toLowerCase())) ?? [], [books.data, query]);
  const current = books.data?.find((book) => book.is_selected);
  const personal = filtered.filter((book) => book.kind === 'personal');
  const system = filtered.filter((book) => book.kind === 'system');

  if (books.isLoading) return <Screen title="词书"><LoadingView /></Screen>;
  if (books.error) return <Screen title="词书"><ErrorState message={(books.error as Error).message} onRetry={() => books.refetch()} /></Screen>;
  return <>
    <Screen title="词书" right={<IconButton icon="close" label="关闭" onPress={() => router.back()} />}>
      <View style={styles.search}><Ionicons name="search-outline" size={19} color={colors.muted} /><TextInput value={query} onChangeText={setQuery} accessibilityLabel="搜索词书" placeholder="搜索词书" placeholderTextColor={colors.muted} style={styles.searchInput} /></View>

      {current ? <View style={styles.activeBook}><View style={styles.activeTop}><View style={{ flex: 1 }}><View style={styles.activeTitle}><AppText variant="heading" numberOfLines={1}>{current.name}</AppText><View style={styles.currentPill}><AppText variant="small" color={colors.green}>当前</AppText></View></View><AppText variant="small" color={colors.greenDark}>已学 {current.learned_count} / {current.word_count}</AppText></View><Ionicons name="leaf" size={28} color={colors.green} /></View><ProgressBar value={current.word_count ? current.learned_count / current.word_count * 100 : 0} /><Button label="学习这本词书" icon="play" onPress={() => router.push({ pathname: '/learn', params: { kind: current.kind, sourceId: current.id } })} /></View> : null}

      <SectionTitle title="我的词书" action={<Pressable accessibilityRole="button" onPress={() => setCreating(true)}><AppText variant="small" color={colors.green}>＋ 新建</AppText></Pressable>} />
      <View style={styles.group}>{personal.length ? personal.map((book) => <BookRow key={`personal-${book.id}`} book={book} onOpen={() => router.push(`/wordbook/${book.kind}/${book.id}` as Href)} />) : <View style={styles.emptyRow}><Ionicons name="list-outline" size={21} color={colors.accent} /><View style={{ flex: 1 }}><AppText variant="label">{query ? '没有找到我的词书' : '还没有自建词书'}</AppText><AppText variant="small" color={colors.muted}>{query ? '换一个关键词试试' : ''}</AppText></View></View>}</View>

      <SectionTitle title="系统词书" />
      {system.length ? <View style={styles.group}>{system.map((book) => <BookRow key={`system-${book.id}`} book={book} onOpen={() => router.push(`/wordbook/${book.kind}/${book.id}` as Href)} />)}</View> : <EmptyState icon="search-outline" title="没有找到词书" message="换一个关键词试试。" />}
    </Screen>

    <Modal visible={creating} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={() => setCreating(false)}><SheetHost><Pressable style={styles.overlay} onPress={() => setCreating(false)}><Sheet style={styles.sheet}><View style={styles.grabber} /><AppText variant="heading">新建词书</AppText><TextField label="名称" value={name} onChangeText={setName} placeholder="例如：写作易错词" autoFocus /><TextField label="说明（可选）" value={description} onChangeText={setDescription} placeholder="这本词书用来学什么" /><Button label="创建词书" onPress={() => create.mutate()} disabled={!name.trim()} loading={create.isPending} />{create.error ? <AppText variant="small" color={colors.danger}>{(create.error as Error).message}</AppText> : null}</Sheet></Pressable></SheetHost></Modal>
  </>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  search: { height: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: radius.md, backgroundColor: colors.surfaceMuted }, searchInput: { flex: 1, color: colors.ink, fontSize: 15 },
  activeBook: { marginTop: 18, padding: 18, gap: 13, borderRadius: radius.lg, backgroundColor: colors.greenPale, ...shadows }, activeTop: { flexDirection: 'row', alignItems: 'center' }, activeTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  currentPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, backgroundColor: 'rgba(31,105,100,0.11)' },
  group: { overflow: 'hidden', borderRadius: radius.lg, backgroundColor: colors.surface, ...shadows },
  bookRow: { minHeight: 74, marginLeft: 16, paddingVertical: 12, paddingRight: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  bookGlyph: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenPale }, bookGlyphGold: { backgroundColor: colors.accentPale },
  rowCopy: { flex: 1, minWidth: 0, gap: 4 }, rowTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emptyRow: { minHeight: 84, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay }, sheet: { paddingHorizontal: 22, paddingBottom: 34, gap: 16, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.background }, grabber: { width: 38, height: 4, alignSelf: 'center', marginTop: 9, borderRadius: 2, backgroundColor: colors.border },
});
