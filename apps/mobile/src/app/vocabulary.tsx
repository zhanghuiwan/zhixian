import { Sheet, SheetHost } from '@/components/sheet';
import { AppIcon as Ionicons } from '@/components/app-icon';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { AppText, Button, EmptyState, ErrorState, IconButton, LoadingView, ProgressBar, Screen, TextField } from '@/components/ui';
import { radius, shadows, type ThemeColors } from '@/constants/theme';
import { useAppearance, useThemedStyles } from '@/context/appearance';
import { api } from '@/lib/api';
import { speakEnglish } from '@/lib/speech';
import type { AddTermsResult, VocabularyItem, Word, Wordbook } from '@/lib/types';

const sourceLabel: Record<string, string> = { article: '文章', study: '学习', manual: '手动', custom_word: '闲闲补充', ai_agent: '闲闲添加' };

export default function VocabularyScreen() {
  const { reduceMotion } = useAppearance();
  const { colors, styles } = useThemedStyles(createStyles);
  const params = useLocalSearchParams<{ createTerm?: string }>();
  const client = useQueryClient();
  const [query, setQuery] = useState('');
  const [bookWord, setBookWord] = useState<Word | null>(null);
  const [notice, setNotice] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [translation, setTranslation] = useState('');
  const [partOfSpeech, setPartOfSpeech] = useState('');
  const [example, setExample] = useState('');
  const vocabulary = useQuery({ queryKey: ['vocabulary'], queryFn: () => api<VocabularyItem[]>('/vocabulary') });
  const books = useQuery({ queryKey: ['library'], queryFn: () => api<Wordbook[]>('/library') });
  const remove = useMutation({ mutationFn: (wordId: number) => api(`/vocabulary/${wordId}`, { method: 'DELETE' }), onSuccess: () => { setNotice('已移出生词本'); client.invalidateQueries({ queryKey: ['vocabulary'] }); client.invalidateQueries({ queryKey: ['library'] }); } });
  const addToBook = useMutation({
    mutationFn: ({ book, word }: { book: Wordbook; word: Word }) => api<AddTermsResult>(`/library/personal/${book.id}/words`, { method: 'POST', body: JSON.stringify({ terms: [word.term] }) }),
    onSuccess: (result, variables) => { setNotice(result.added ? `${variables.word.term} 已加入「${variables.book.name}」` : `${variables.word.term} 已在「${variables.book.name}」中`); setBookWord(null); client.invalidateQueries({ queryKey: ['library'] }); },
  });
  const createCustom = useMutation({
    mutationFn: () => api('/vocabulary/custom-words', { method: 'POST', body: JSON.stringify({ term: term.trim(), translation: translation.trim(), phonetic: '', part_of_speech: partOfSpeech.trim(), definitions: [{ part_of_speech: partOfSpeech.trim(), meaning: translation.trim() }], example: example.trim(), example_translation: '' }) }),
    onSuccess: () => { setNotice(`${term.trim()} 已加入我的新增单词`); setCustomOpen(false); setTerm(''); setTranslation(''); setPartOfSpeech(''); setExample(''); client.invalidateQueries({ queryKey: ['vocabulary'] }); client.invalidateQueries({ queryKey: ['library'] }); },
  });
  useEffect(() => { if (params.createTerm) { setTerm(params.createTerm); setCustomOpen(true); } }, [params.createTerm]);
  const items = useMemo(() => vocabulary.data?.filter((item) => !query.trim() || `${item.word.term} ${item.word.translation}`.toLowerCase().includes(query.trim().toLowerCase())) ?? [], [query, vocabulary.data]);
  const personalBooks = books.data?.filter((book) => book.kind === 'personal') ?? [];
  if (vocabulary.isLoading) return <Screen title="生词本"><LoadingView /></Screen>;
  if (vocabulary.error) return <Screen title="生词本"><ErrorState message={(vocabulary.error as Error).message} onRetry={() => vocabulary.refetch()} /></Screen>;
  return <>
    <Screen title="生词本" subtitle={`${vocabulary.data?.length ?? 0} 词`} right={<IconButton icon="close" label="关闭" onPress={() => router.back()} />} refreshing={vocabulary.isFetching} onRefresh={() => vocabulary.refetch()}>
      <View style={styles.toolbar}><View style={styles.search}><Ionicons name="search-outline" size={19} color={colors.muted} /><TextInput value={query} onChangeText={setQuery} accessibilityLabel="搜索英文或中文" placeholder="搜索英文或中文" placeholderTextColor={colors.muted} style={styles.searchInput} /></View><Pressable accessibilityRole="button" accessibilityLabel="添加自定义单词" onPress={() => setCustomOpen(true)} style={styles.add}><Ionicons name="add" size={22} color={colors.onPrimary} /></Pressable></View>
      {notice ? <View style={styles.notice}><Ionicons name="checkmark-circle" size={18} color={colors.green} /><AppText variant="small" color={colors.green}>{notice}</AppText></View> : null}
      {items.length ? <View style={styles.list}>{items.map((item) => <View key={item.id} style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel={`朗读 ${item.word.term}`} onPress={() => speakEnglish(item.word.term)} style={styles.sound}><Ionicons name="volume-high-outline" size={19} color={colors.green} /></Pressable>
        <View style={styles.copy}><View style={styles.termLine}><AppText variant="heading">{item.word.term}</AppText>{item.word.dictionary_source === 'custom' ? <View style={styles.tag}><AppText variant="small" color={colors.accentDark}>我的新增</AppText></View> : null}</View><AppText variant="small" color={colors.muted}>{item.word.phonetic} · {sourceLabel[item.source_type] || item.source_type}</AppText><AppText numberOfLines={2}>{item.word.translation}</AppText><View style={styles.mastery}><ProgressBar value={item.mastery_score} /><AppText variant="small" color={colors.green}>{item.mastery_score}%</AppText></View></View>
        <View style={styles.rowActions}><Pressable accessibilityRole="button" accessibilityLabel="加入指定词书" onPress={() => { setNotice(''); setBookWord(item.word); }} style={styles.iconAction}><Ionicons name="add-circle-outline" size={20} color={colors.green} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="移出生词本" onPress={() => remove.mutate(item.word.id)} style={styles.iconAction}><Ionicons name="close" size={19} color={colors.muted} /></Pressable></View>
      </View>)}</View> : <EmptyState icon="bookmark-outline" title={query ? '没有匹配的单词' : '生词本还是空的'} message={query ? '换一个关键词试试看。' : '阅读时点按单词，就能查义并加入生词本。'} />}
    </Screen>

    <Modal visible={!!bookWord} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={() => setBookWord(null)}><SheetHost><Pressable style={styles.overlay} onPress={() => setBookWord(null)}><Sheet style={styles.sheet}><View style={styles.grabber} /><AppText variant="heading">把 {bookWord?.term} 加入词书</AppText><ScrollView style={styles.bookList}>{personalBooks.map((book) => <Pressable accessibilityRole="button" key={book.id} disabled={addToBook.isPending} onPress={() => bookWord && addToBook.mutate({ book, word: bookWord })} style={styles.bookRow}><View style={styles.bookIcon}><Ionicons name={book.is_default ? 'bookmark-outline' : 'albums-outline'} size={19} color={colors.green} /></View><View style={{ flex: 1 }}><AppText variant="label">{book.name}</AppText><AppText variant="small" color={colors.muted}>{book.word_count} 个单词{book.is_default ? ' · 默认收藏' : ''}</AppText></View><Ionicons name="add" size={20} color={colors.green} /></Pressable>)}</ScrollView>{books.error ? <AppText variant="small" color={colors.danger}>{(books.error as Error).message}</AppText> : null}{addToBook.error ? <AppText variant="small" color={colors.danger}>{(addToBook.error as Error).message}</AppText> : null}</Sheet></Pressable></SheetHost></Modal>

    <Modal visible={customOpen} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={() => setCustomOpen(false)}><SheetHost><Pressable style={styles.overlay} onPress={() => setCustomOpen(false)}><Sheet style={styles.sheet}><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.formContent}><View style={styles.grabber} /><AppText variant="heading">添加我的单词</AppText><TextField label="英文单词" value={term} onChangeText={setTerm} autoCapitalize="none" autoCorrect={false} autoFocus /><TextField label="中文释义" value={translation} onChangeText={setTranslation} /><TextField label="词性（可选）" value={partOfSpeech} onChangeText={setPartOfSpeech} placeholder="例如 n. / v." /><TextField label="英文例句（可选）" value={example} onChangeText={setExample} multiline /><Button label="加入我的新增单词" onPress={() => createCustom.mutate()} disabled={!term.trim() || !translation.trim()} loading={createCustom.isPending} />{createCustom.error ? <AppText variant="small" color={colors.danger}>{(createCustom.error as Error).message}</AppText> : null}</ScrollView></Sheet></Pressable></SheetHost></Modal>
  </>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  toolbar: { flexDirection: 'row', gap: 10 }, search: { flex: 1, height: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: radius.md, backgroundColor: colors.surfaceMuted }, searchInput: { flex: 1, color: colors.ink, fontSize: 15 }, add: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green },
  notice: { minHeight: 44, marginTop: 12, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: radius.md, backgroundColor: colors.greenPale },
  list: { marginTop: 16, overflow: 'hidden', borderRadius: radius.lg, backgroundColor: colors.surface, ...shadows },
  row: { minHeight: 122, marginLeft: 16, paddingVertical: 14, paddingRight: 8, flexDirection: 'row', alignItems: 'flex-start', gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  sound: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenPale }, copy: { flex: 1, minWidth: 0, gap: 4 },
  termLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 }, tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: colors.accentPale },
  mastery: { marginTop: 3, flexDirection: 'row', alignItems: 'center', gap: 9 }, rowActions: { gap: 2 }, iconAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay }, sheet: { maxHeight: '84%', paddingHorizontal: 22, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.background }, formContent: { paddingBottom: 34, gap: 14 }, grabber: { width: 38, height: 4, alignSelf: 'center', marginTop: 9, borderRadius: 2, backgroundColor: colors.border },
  bookList: { maxHeight: 360 }, bookRow: { minHeight: 68, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, backgroundColor: colors.surface }, bookIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenPale },
});
