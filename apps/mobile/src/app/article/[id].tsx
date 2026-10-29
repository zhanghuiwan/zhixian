import { Sheet, SheetHost } from '@/components/sheet';
import { AppIcon as Ionicons } from '@/components/app-icon';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, type NativeScrollEvent, type NativeSyntheticEvent, View } from 'react-native';
import { AppText, Button, Card, ErrorState, IconButton, LoadingView, Pill, Screen } from '@/components/ui';
import { fonts, radius, type ThemeColors } from '@/constants/theme';
import { useAppearance, useThemedStyles } from '@/context/appearance';
import { api } from '@/lib/api';
import { speakEnglish } from '@/lib/speech';
import type { ArticleDetail, ArticleSentence, VocabularyItem, Word } from '@/lib/types';

function WordText({ sentence, onWord }: { sentence: string; onWord: (word: string) => void }) {
  const { styles } = useThemedStyles(createStyles);
  const pieces = useMemo(() => sentence.split(/([A-Za-z]+(?:'[A-Za-z]+)?)/g), [sentence]);
  return <AppText selectable style={styles.sentenceText}>{pieces.map((piece, index) => /^[A-Za-z]/.test(piece) ? <AppText key={`${piece}-${index}`} onPress={() => onWord(piece)} style={styles.lookupWord}>{piece}</AppText> : piece)}</AppText>;
}

export default function ArticleReader() {
  const { colors, styles } = useThemedStyles(createStyles);
  const { reduceMotion } = useAppearance();
  const { id } = useLocalSearchParams<{ id: string }>();
  const articleId = Number(id);
  const client = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);
  const sentenceOffsets = useRef(new Map<number, number>());
  const contentOffset = useRef(0);
  const restored = useRef(false);
  const visiblePosition = useRef(1);
  const lastSavedPosition = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingPosition = useRef(false);
  const queuedPosition = useRef<number | null>(null);
  const [translations, setTranslations] = useState<Set<number>>(new Set());
  const [lookup, setLookup] = useState<{ loading: boolean; word?: Word; term: string; error?: string } | null>(null);
  const [addedWordId, setAddedWordId] = useState<number | null>(null);
  const [readingError, setReadingError] = useState('');
  const article = useQuery({ queryKey: ['article', articleId], queryFn: () => api<ArticleDetail>(`/articles/${articleId}`), enabled: Number.isFinite(articleId) });
  const progress = useMutation({ mutationFn: ({ position, percent, completed }: { position: number; percent: number; completed: boolean }) => api(`/articles/${articleId}/progress`, { method: 'PUT', body: JSON.stringify({ position, percent, completed }) }), onSuccess: (_, variables) => { lastSavedPosition.current = variables.position; client.setQueryData<ArticleDetail>(['article', articleId], (current) => current ? { ...current, last_position: variables.position, progress: variables.percent, is_completed: current.is_completed || variables.completed } : current); client.invalidateQueries({ queryKey: ['articles'] }); client.invalidateQueries({ queryKey: ['records'] }); } });
  const bookmark = useMutation({ mutationFn: ({ sentence, active }: { sentence: ArticleSentence; active: boolean }) => api(`/articles/sentences/${sentence.id}/bookmark`, { method: active ? 'DELETE' : 'POST' }), onSuccess: () => { client.invalidateQueries({ queryKey: ['article', articleId] }); client.invalidateQueries({ queryKey: ['sentences'] }); } });
  const addWord = useMutation({ mutationFn: (word: Word) => api<VocabularyItem>('/vocabulary', { method: 'POST', body: JSON.stringify({ word_id: word.id, source_type: 'article', source_ref: String(articleId), note: '' }) }), onSuccess: (item) => { setAddedWordId(item.word.id); client.invalidateQueries({ queryKey: ['vocabulary'] }); client.invalidateQueries({ queryKey: ['library'] }); } });

  useEffect(() => { restored.current = false; sentenceOffsets.current.clear(); lastSavedPosition.current = 0; }, [articleId]);
  useEffect(() => { if (article.data) { visiblePosition.current = article.data.last_position || 1; lastSavedPosition.current = article.data.last_position || 1; } }, [article.data]);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const saveReadingPosition = async (position: number) => {
    if (!article.data || position === lastSavedPosition.current) return;
    if (savingPosition.current) { queuedPosition.current = position; return; }
    savingPosition.current = true;
    const percent = Math.min(99, Math.round(position / Math.max(1, article.data.sentences.length) * 100));
    try {
      await api(`/articles/${articleId}/progress`, { method: 'PUT', body: JSON.stringify({ position, percent, completed: false }) });
      lastSavedPosition.current = position;
      setReadingError('');
      client.setQueryData<ArticleDetail>(['article', articleId], (current) => current ? { ...current, last_position: position, progress: percent } : current);
      client.invalidateQueries({ queryKey: ['articles'] });
      client.invalidateQueries({ queryKey: ['records'] });
    } catch { setReadingError('阅读位置暂未保存，继续滚动后会自动重试');
    } finally {
      savingPosition.current = false;
      const queued = queuedPosition.current;
      queuedPosition.current = null;
      if (queued && queued !== lastSavedPosition.current) void saveReadingPosition(queued);
    }
  };
  const schedulePositionSave = (position: number) => {
    if (position === lastSavedPosition.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveReadingPosition(position), 700);
  };
  const updateVisibleSentence = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const marker = event.nativeEvent.contentOffset.y + 128;
    let current = 1;
    sentenceOffsets.current.forEach((offset, position) => { if (contentOffset.current + offset <= marker && position > current) current = position; });
    if (current !== visiblePosition.current) { visiblePosition.current = current; schedulePositionSave(current); }
  };
  const flushPosition = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveReadingPosition(visiblePosition.current);
  };
  const restorePosition = () => {
    if (restored.current || !article.data || article.data.last_position <= 1) return;
    const offset = sentenceOffsets.current.get(article.data.last_position);
    if (typeof offset !== 'number') return;
    restored.current = true;
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: Math.max(0, contentOffset.current + offset - 24), animated: false }));
  };
  const findWord = async (term: string) => {
    addWord.reset(); setAddedWordId(null); setLookup({ loading: true, term });
    try { setLookup({ loading: false, term, word: await api<Word>(`/words/lookup?term=${encodeURIComponent(term)}`) }); }
    catch (cause) { setLookup({ loading: false, term, error: (cause as Error).message }); }
  };
  const askAI = (prompt: string) => router.push({ pathname: '/', params: { prompt } });
  const toggleTranslation = (sentence: ArticleSentence) => { setTranslations((current) => { const next = new Set(current); if (next.has(sentence.id)) next.delete(sentence.id); else next.add(sentence.id); return next; }); };
  if (article.isLoading) return <Screen><LoadingView label="正在打开文章" /></Screen>;
  if (article.error || !article.data) return <Screen><ErrorState message={(article.error as Error)?.message || '文章不存在'} onRetry={() => article.refetch()} /></Screen>;
  return <>
    <Screen scroll={false} title={article.data.title} subtitle={article.data.title_zh || `${article.data.level} · ${article.data.read_minutes} 分钟`} right={<IconButton icon="close" label="关闭文章" onPress={() => { flushPosition(); router.back(); }} />}>
      <ScrollView ref={scrollRef} style={styles.reader} contentContainerStyle={styles.readerContent} showsVerticalScrollIndicator={false} scrollEventThrottle={180} onScroll={updateVisibleSentence} onScrollEndDrag={flushPosition} onMomentumScrollEnd={flushPosition} onContentSizeChange={restorePosition}>
        <Card style={styles.intro}><View style={styles.meta}><Pill>{article.data.level}</Pill><Pill tone="neutral">{article.data.topic}</Pill></View><AppText color={colors.inkSoft}>{article.data.summary}</AppText><AppText variant="small" color={colors.muted}>点词查义 · 长按选句</AppText>{article.data.last_position > 1 ? <AppText variant="small" color={colors.green}>已回到上次阅读的第 {article.data.last_position} 句</AppText> : null}{readingError ? <AppText variant="small" color={colors.danger}>{readingError}</AppText> : null}</Card>
        <View onLayout={(event) => { contentOffset.current = event.nativeEvent.layout.y; restorePosition(); }} style={styles.content}>{article.data.sentences.map((sentence) => <View key={sentence.id} onLayout={(event) => { sentenceOffsets.current.set(sentence.position, event.nativeEvent.layout.y); restorePosition(); }} style={styles.sentence}><WordText sentence={sentence.text} onWord={findWord} /><View style={styles.actions}><Pressable accessibilityRole="button" onPress={() => speakEnglish(sentence.text)} style={styles.inlineAction}><Ionicons name="volume-high-outline" size={16} color={colors.green} /><AppText variant="small" color={colors.green}>朗读</AppText></Pressable><Pressable accessibilityRole="button" onPress={() => toggleTranslation(sentence)} style={styles.inlineAction}><Ionicons name="language-outline" size={16} color={colors.green} /><AppText variant="small" color={colors.green}>{translations.has(sentence.id) ? '收起' : '翻译'}</AppText></Pressable><Pressable accessibilityRole="button" onPress={() => bookmark.mutate({ sentence, active: sentence.is_bookmarked })} style={styles.inlineAction}><Ionicons name={sentence.is_bookmarked ? 'bookmark' : 'bookmark-outline'} size={16} color={sentence.is_bookmarked ? colors.terra : colors.green} /><AppText variant="small" color={sentence.is_bookmarked ? colors.terra : colors.green}>{sentence.is_bookmarked ? '已收藏' : '收藏'}</AppText></Pressable><Pressable accessibilityRole="button" onPress={() => askAI(`请解释《${article.data.title}》中的这句话，包括语法与语境：${sentence.text}`)} style={styles.inlineAction}><Ionicons name="leaf-outline" size={16} color={colors.green} /><AppText variant="small" color={colors.green}>问闲闲</AppText></Pressable></View>{translations.has(sentence.id) ? <AppText color={colors.inkSoft} style={styles.translation}>{sentence.translation}</AppText> : null}</View>)}</View>
        <Button label={article.data.is_completed ? '已完成阅读' : '完成这篇阅读'} icon="checkmark-circle-outline" disabled={article.data.is_completed} loading={progress.isPending} onPress={() => progress.mutate({ position: article.data.sentences.length, percent: 100, completed: true })} />
      </ScrollView>
    </Screen>
    <Pressable accessibilityRole="button" accessibilityLabel="询问闲闲" onPress={() => askAI(`我正在读《${article.data.title}》，请结合文章内容帮助我精读。`)} style={styles.aiFloat}><Ionicons name="leaf" size={22} color={colors.onPrimary} /></Pressable>
    <Modal visible={!!lookup} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => setLookup(null)}><SheetHost><Pressable style={styles.overlay} onPress={() => setLookup(null)}><Sheet style={styles.sheet}>{lookup?.loading ? <LoadingView label={`正在查询 ${lookup.term}`} /> : lookup?.word ? <View style={{ gap: 12 }}><View style={styles.lookupHead}><View><AppText variant="title">{lookup.word.term}</AppText><AppText color={colors.muted}>{lookup.word.phonetic} · {lookup.word.part_of_speech}</AppText></View><IconButton icon="volume-high-outline" label="朗读单词" onPress={() => speakEnglish(lookup.word!.term)} /></View><AppText variant="heading">{lookup.word.translation}</AppText>{lookup.word.example ? <Card muted><AppText>{lookup.word.example}</AppText><AppText variant="small" color={colors.muted}>{lookup.word.example_translation}</AppText></Card> : null}<Button label={addedWordId === lookup.word.id ? '已加入生词本' : '加入生词本'} icon="bookmark-outline" disabled={addedWordId === lookup.word.id} loading={addWord.isPending} onPress={() => addWord.mutate(lookup.word!)} />{addWord.error ? <AppText variant="small" color={colors.danger}>{(addWord.error as Error).message}</AppText> : null}<Button label="问闲闲深入解释" variant="secondary" onPress={() => { const term = lookup.word!.term; setLookup(null); askAI(`请详细解释单词 ${term}，包括词义、用法和记忆方法。`); }} /></View> : <View style={{ gap: 12 }}><AppText variant="heading">未在词库找到 “{lookup?.term}”</AppText><AppText color={colors.muted}>{lookup?.error}</AppText><Button label="让闲闲解释" onPress={() => { const term = lookup?.term || ''; setLookup(null); askAI(`请解释英文词语 ${term}，给出词义、发音、例句和记忆方法。`); }} /></View>}</Sheet></Pressable></SheetHost></Modal>
  </>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({ reader: { flex: 1 }, readerContent: { paddingBottom: 104 }, intro: { gap: 10, backgroundColor: colors.greenPale }, meta: { flexDirection: 'row', gap: 7 }, content: { marginVertical: 18, paddingHorizontal: 18, overflow: 'hidden', borderRadius: radius.lg, backgroundColor: colors.surface }, sentence: { paddingVertical: 22, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, gap: 12 }, sentenceText: { fontSize: 20, lineHeight: 36, fontFamily: fonts.serif, color: colors.ink }, lookupWord: { fontSize: 20, lineHeight: 36, fontFamily: fonts.serif }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, inlineAction: { minHeight: 44, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.md, backgroundColor: colors.surfaceMuted }, translation: { padding: 13, borderRadius: radius.md, backgroundColor: colors.accentPale }, aiFloat: { position: 'absolute', right: 20, bottom: 24, minWidth: 92, minHeight: 48, paddingHorizontal: 14, flexDirection: 'row', gap: 7, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green, elevation: 5 }, overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay }, sheet: { minHeight: 310, maxHeight: '78%', padding: 24, paddingBottom: 34, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.background }, lookupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' } });
