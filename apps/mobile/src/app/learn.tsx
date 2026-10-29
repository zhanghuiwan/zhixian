import { QuickWordRow } from '@/components/quick-word-row';
import { AppIcon } from '@/components/app-icon';
import { CompanionView } from '@/components/companion';
import Slider from '@react-native-community/slider';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, ErrorState, LoadingView } from '@/components/ui';
import { fonts, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/context/appearance';
import { useAuth } from '@/context/auth';
import { api } from '@/lib/api';
import { speakEnglish } from '@/lib/speech';
import { createDraft, currentItem, finalizeDraft, isDraftComplete, recordAttempt, roundStats, roundWordIds } from '@/lib/study-session';
import { loadStudyDraft, removeStudyDraft, saveStudyDraft, studyKey } from '@/lib/study-store';
import type { StudyAttempt, StudyDraft, StudyQueue, StudySessionResult } from '@/lib/types';

type Stage = 'loading' | 'learning' | 'submitting' | 'done' | 'empty' | 'error';
const scoreLabels = [{ score: 0, label: '不记得', kind: 'forgot' }, { score: 50, label: '模糊', kind: 'fuzzy' }, { score: 90, label: '熟悉', kind: 'remembered' }] as const;

export default function LearnScreen() {
  const { colors, styles } = useThemedStyles(createStyles);
  const params = useLocalSearchParams<{ kind?: string; sourceId?: string; mode?: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const kind = params.kind === 'system' || params.kind === 'personal' ? params.kind : 'all';
  const sourceId = params.sourceId ? Number(params.sourceId) : null;
  const mode = params.mode === 'new' || params.mode === 'review' ? params.mode : 'all';
  const key = useMemo(() => studyKey(user?.id || 0, kind, sourceId, mode), [kind, mode, sourceId, user?.id]);
  const [stage, setStage] = useState<Stage>('loading');
  const [draft, setDraft] = useState<StudyDraft | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [exampleTranslated, setExampleTranslated] = useState(false);
  const [sliderScore, setSliderScore] = useState(50);
  const [busy, setBusy] = useState(false);
  const [openRowId, setOpenRowId] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [result, setResult] = useState<StudySessionResult | null>(null);
  const [emptyReason, setEmptyReason] = useState<StudyQueue['empty_reason']>(null);
  const [error, setError] = useState('');
  const shownAt = useRef(Date.now());
  const submitting = useRef(false);
  const grading = useRef(false);
  const starting = useRef(false);
  const continuingNew = useRef(false);
  const activeWordId = draft?.active_word_ids[0];

  const begin = useCallback(async (fresh = false) => {
    if (starting.current) return;
    starting.current = true;
    if (fresh) continuingNew.current = true;
    const nextGroup = continuingNew.current;
    setStage('loading'); setError(''); setResult(null); setEmptyReason(null); setDraft(null);
    try {
      if (!fresh) { const saved = await loadStudyDraft(key); if (saved?.items.length) { setDraft(saved); setStage(isDraftComplete(saved) ? 'submitting' : 'learning'); return; } }
      const requestMode = nextGroup ? 'new' : mode;
      const query = new URLSearchParams({ limit: '10', mode: requestMode });
      if (nextGroup) query.set('next_group', 'true');
      if (kind !== 'all' && sourceId) { query.set('kind', kind); query.set('source_id', String(sourceId)); }
      const queue = await api<StudyQueue>(`/study/queue?${query}`);
      if (nextGroup && (queue.remaining_new_count == null || queue.source_kind == null)) throw new Error('服务器需要更新后才能继续新学');
      if (!queue.items.length) { setEmptyReason(queue.empty_reason); setStage('empty'); return; }
      const next = createDraft(queue, requestMode, 'card'); await saveStudyDraft(key, next); setDraft(next); setStage('learning');
    } catch (cause) { setError((cause as Error).message); setStage('error'); }
    finally { starting.current = false; }
  }, [key, kind, mode, sourceId]);

  useEffect(() => { begin(); }, [begin]);
  useEffect(() => { shownAt.current = Date.now(); setRevealed(false); setExampleTranslated(false); setSliderScore(50); }, [activeWordId, draft?.view_mode, draft?.round_no]);
  useEffect(() => { setOpenRowId(null); scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [draft?.round_no, draft?.view_mode]);

  const submit = useCallback(async (completed: StudyDraft) => {
    if (submitting.current) return;
    submitting.current = true;
    setStage('submitting'); setError('');
    const snapshot = finalizeDraft(completed);
    const payload = snapshot.completion_payload!;
    try {
      if (!completed.completion_payload) { setDraft(snapshot); await saveStudyDraft(key, snapshot); }
      const response = await api<StudySessionResult>('/study/sessions/complete', { method: 'POST', body: JSON.stringify(payload) });
      await removeStudyDraft(key);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['study-queue-preview'] }),
        queryClient.invalidateQueries({ queryKey: ['study-new-preview'] }),
        queryClient.invalidateQueries({ queryKey: ['records'] }),
        queryClient.invalidateQueries({ queryKey: ['library'] }),
      ]);
      setResult(response); setStage('done');
    } catch (cause) { setDraft(snapshot); setError((cause as Error).message); setStage('error'); }
    finally { submitting.current = false; }
  }, [key, queryClient]);

  useEffect(() => { if (stage === 'submitting' && draft && isDraftComplete(draft)) submit(draft); }, [draft, stage, submit]);

  const grade = useCallback(async (score: number, answerKind: StudyAttempt['answer_kind'], wordId = activeWordId, wasRevealed = revealed) => {
    if (!draft || stage !== 'learning' || grading.current || wordId === undefined || !draft.active_word_ids.includes(wordId)) return;
    grading.current = true; setBusy(true); setError('');
    const attempt: StudyAttempt = { score: Math.round(score), answer_kind: answerKind, round_no: draft.round_no, response_ms: Math.min(3_600_000, Math.max(0, Date.now() - shownAt.current)), revealed_before_answer: wasRevealed };
    const recorded = recordAttempt(draft, wordId, attempt);
    const next = isDraftComplete(recorded) ? finalizeDraft(recorded) : recorded;
    try {
      // Persist first so closing the App can never lose an answer shown as saved.
      await saveStudyDraft(key, next); setDraft(next);
      Haptics.impactAsync(score >= 80 ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      if (isDraftComplete(next)) setStage('submitting');
    } catch (cause) { setError(`本次作答未保存，请重新评分。${(cause as Error).message}`); }
    finally { grading.current = false; setBusy(false); }
  }, [activeWordId, draft, key, revealed, stage]);
  const quickGrade = useCallback((id: number, score: number, wasRevealed: boolean) => { void grade(score, 'quick', id, wasRevealed); }, [grade]);
  const switchMode = async (viewMode: StudyDraft['view_mode']) => {
    if (!draft || grading.current || draft.view_mode === viewMode) return;
    grading.current = true; setBusy(true);
    try { const next = { ...draft, view_mode: viewMode }; await saveStudyDraft(key, next); setDraft(next); setError(''); }
    catch (cause) { setError(`模式切换未保存。${(cause as Error).message}`); }
    finally { grading.current = false; setBusy(false); }
  };

  if (stage === 'loading') return <SafeAreaView style={styles.screen}><LoadingView label="正在准备这一组单词" /></SafeAreaView>;
  if (stage === 'error') return <SafeAreaView style={styles.screen}><View style={styles.stateWrap}><ErrorState message={error} onRetry={() => draft && isDraftComplete(draft) ? setStage('submitting') : begin()} /><Button label="返回学习页" variant="ghost" onPress={() => router.back()} /></View></SafeAreaView>;
  if (stage === 'submitting') return <SafeAreaView style={styles.screen}><View style={styles.submit}><ActivityIndicator size="large" color={colors.green} /><AppText variant="heading">正在保存整组记录</AppText></View></SafeAreaView>;
  if (stage === 'empty') {
    const bookCompleted = emptyReason === 'book_completed';
    const needsBook = bookCompleted || emptyReason === 'no_selected_book';
    const title = bookCompleted ? '当前词书已学完' : emptyReason === 'no_selected_book' ? '请先选择词书' : emptyReason === 'daily_goal_reached' ? '今日新词目标已完成' : mode === 'review' ? '当前没有到期单词' : '暂无待学单词';
    return <SafeAreaView style={styles.screen}><View style={styles.done}><AppText variant="heading">{title}</AppText><View style={styles.doneActions}>{needsBook ? <Button label="选择词书" onPress={() => router.replace('/wordbooks')} /> : <Button label="再学一组" onPress={() => begin(true)} />}<Button label="返回学习页" variant="ghost" onPress={() => router.replace('/study')} /></View></View></SafeAreaView>;
  }
  if (stage === 'done') return <SafeAreaView style={styles.screen}><View style={styles.done}><CompanionView size={120} state="success" /><AppText variant="title">这一组完成了</AppText><AppText color={colors.muted}>{result ? `${result.word_count} 个单词 · 记录已保存`  : '暂无待学单词'}</AppText><View style={styles.doneActions}><Button label="返回学习页" onPress={() => router.replace('/study')} /><Button label="再学一组" variant="secondary" onPress={() => begin(true)} /></View></View></SafeAreaView>;

  const item = draft && currentItem(draft); if (!draft || !item) return null;
  const stats = roundStats(draft);
  const roundItems = roundWordIds(draft).map((id) => draft.items.find((entry) => entry.word.id === id)!).filter(Boolean);
  return <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="退出学习" onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><AppIcon name="chevron-back" size={22} color={colors.ink} /></Pressable>
      <AppText style={styles.pageTitle}>单词学习</AppText><View style={styles.headerBalance} />
    </View>
    <View style={styles.toolbar}>
      <View style={styles.countBalance} />
      <View style={styles.modeSwitch}>{(['card', 'quick'] as const).map((viewMode) => <Pressable key={viewMode} accessibilityRole="button" aria-selected={draft.view_mode === viewMode} accessibilityState={{ selected: draft.view_mode === viewMode, disabled: busy }} disabled={busy} hitSlop={{ top: 3, bottom: 3 }} onPress={() => switchMode(viewMode)} style={({ pressed }) => [styles.modeOption, draft.view_mode === viewMode && styles.modeOptionActive, pressed && styles.pressed]}><AppText style={[styles.modeLabel, draft.view_mode === viewMode && styles.modeLabelActive]} color={draft.view_mode === viewMode ? colors.ink : colors.inkSoft}>{viewMode === 'card' ? '卡片' : '列表'}</AppText></Pressable>)}</View>
      <AppText style={styles.count} color={colors.muted}>{stats.done} / {stats.total}</AppText>
    </View>
    <View style={styles.progressArea}>
      <View accessibilityRole="progressbar" accessibilityLabel="学习进度" accessibilityValue={{ min: 0, max: stats.total, now: stats.done }} style={styles.progressTrack}><View style={[styles.progressFill, { width: `${stats.total ? stats.done / stats.total * 100 : 0}%` }]} /></View>
    </View>
    {error ? <AppText accessibilityLiveRegion="polite" variant="small" color={colors.danger} style={styles.error}>{error}</AppText> : null}
    <ScrollView ref={scrollRef} style={styles.mainScroll} contentContainerStyle={[styles.main, draft.view_mode === 'quick' && styles.listContent]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {draft.view_mode === 'quick' ? <>
        {roundItems.map((entry) => <QuickWordRow key={`${draft.round_no}:${entry.word.id}`} item={entry} busy={busy} openId={openRowId} onOpen={setOpenRowId} onGrade={quickGrade} status={draft.active_word_ids.includes(entry.word.id) ? 'pending' : draft.next_round_word_ids.includes(entry.word.id) ? 'retry' : 'remembered'} />)}
      </> : <View style={styles.wordCard}>
        {revealed ? <>
          <View style={styles.wordHeading}><AppText variant="word" style={styles.word}>{item.word.term}</AppText><Pressable accessibilityRole="button" accessibilityLabel="播放发音" onPress={() => speakEnglish(item.word.term)} style={({ pressed }) => [styles.audio, pressed && styles.pressed]}><AppIcon name="volume-high-outline" size={18} color={colors.ink} /></Pressable></View>
          {item.word.phonetic ? <AppText style={styles.phonetic} color={colors.muted}>{item.word.phonetic}</AppText> : null}
          <View style={styles.answer}>
            {item.word.part_of_speech ? <AppText style={styles.partOfSpeech} color={colors.muted}>{item.word.part_of_speech}</AppText> : null}
            <AppText style={styles.meaning}>{item.word.translation}</AppText>
            {item.word.example ? <View style={styles.exampleBlock}><AppText style={styles.example}>{item.word.example}</AppText>{item.word.example_translation ? <><Pressable accessibilityRole="button" accessibilityState={{ expanded: exampleTranslated }} onPress={() => setExampleTranslated(!exampleTranslated)} style={({ pressed }) => [styles.translationAction, pressed && styles.pressed]}><AppText style={styles.translationLabel} color={colors.inkSoft}>{exampleTranslated ? '收起译文' : '显示译文'}</AppText></Pressable>{exampleTranslated ? <AppText style={styles.exampleTranslation} color={colors.muted}>{item.word.example_translation}</AppText> : null}</> : null}</View> : null}
          </View>
        </> : <View style={styles.recall}>
          <AppText variant="word" style={[styles.word, styles.recallWord]}>{item.word.term}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="播放发音" onPress={() => speakEnglish(item.word.term)} style={({ pressed }) => [styles.audio, pressed && styles.pressed]}><AppIcon name="volume-high-outline" size={18} color={colors.ink} /></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setRevealed(true)} style={({ pressed }) => [styles.revealButton, pressed && styles.pressed]}><AppText style={styles.revealLabel} color={colors.greenDark}>查看释义</AppText></Pressable>
        </View>}
      </View>}
    </ScrollView>
    {draft.view_mode === 'card' && revealed ? <View style={styles.gradeArea}>
      <View style={styles.fixedGrades}>{scoreLabels.map((option) => <Pressable accessibilityRole="button" accessibilityLabel={`${option.label}，熟悉度 ${option.score}`} disabled={busy} key={option.score} onPress={() => grade(option.score, option.kind)} style={({ pressed }) => [styles.gradeButton, option.score === 90 && styles.gradeKnown, pressed && styles.pressed, busy && styles.disabled]}><AppText style={styles.gradeLabel} color={option.score === 90 ? colors.onPrimary : colors.ink}>{option.label}</AppText></Pressable>)}</View>
      <View style={styles.scoreLine}><AppText style={styles.hint} color={colors.muted}>熟悉度 {Math.round(sliderScore)}</AppText><AppText style={styles.hint} color={colors.muted}>松手即提交</AppText></View>
      <Slider accessibilityLabel="熟悉度，松开滑杆提交评分" minimumValue={0} maximumValue={100} step={5} value={sliderScore} disabled={busy} onValueChange={setSliderScore} onSlidingComplete={(value) => grade(value, 'slider')} minimumTrackTintColor={colors.green} maximumTrackTintColor={colors.line} thumbTintColor={colors.green} style={styles.slider} />
    </View> : null}
  </SafeAreaView>;
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  header: { minHeight: 48, marginHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, headerBalance: { width: 44 },
  pageTitle: { flex: 1, textAlign: 'center', fontSize: 16, lineHeight: 24, fontWeight: '600' },
  toolbar: { minHeight: 48, marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  countBalance: { width: 56 }, count: { width: 56, textAlign: 'right', fontSize: 12, lineHeight: 18, fontVariant: ['tabular-nums'] },
  modeSwitch: { width: 128, flexDirection: 'row', padding: 3, borderRadius: 11, backgroundColor: c.surfaceMuted },
  modeOption: { flex: 1, minHeight: 38, paddingHorizontal: 8, paddingVertical: 5, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
  modeOptionActive: { backgroundColor: c.surface, borderColor: c.line },
  modeLabel: { fontSize: 12, lineHeight: 18, fontWeight: '500' },
  modeLabelActive: { fontWeight: '600' },
  progressArea: { marginHorizontal: 20, marginTop: 2, marginBottom: 12 },
  progressTrack: { height: 3, backgroundColor: c.line, borderRadius: 2, overflow: 'hidden' }, progressFill: { height: '100%', backgroundColor: c.green, borderRadius: 2 },
  mainScroll: { flex: 1 }, main: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 16 }, listContent: { paddingBottom: 24 },
  hint: { fontSize: 11, lineHeight: 17 }, error: { marginHorizontal: 20, marginBottom: 10 },
  wordCard: { flex: 1, minHeight: 260, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
  wordHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 10 },
  word: { flexShrink: 1, minWidth: 0, maxWidth: '100%', fontFamily: fonts.serif, fontSize: 32, lineHeight: 42, fontWeight: '400', letterSpacing: -0.5 },
  audio: { width: 44, height: 44, flexShrink: 0, borderRadius: 22, backgroundColor: c.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginTop: 0 },
  phonetic: { marginTop: 6, fontSize: 12, lineHeight: 20 }, answer: { marginTop: 20 }, partOfSpeech: { fontSize: 12, lineHeight: 18, marginBottom: 6 }, meaning: { fontSize: 16, lineHeight: 26, fontWeight: '400' },
  exampleBlock: { marginTop: 20 }, example: { fontSize: 14, lineHeight: 23 }, translationAction: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingRight: 16 }, translationLabel: { fontSize: 12, lineHeight: 18 }, exampleTranslation: { fontSize: 13, lineHeight: 22, marginTop: 2 },
  recall: { flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 24 }, recallWord: { textAlign: 'center', width: '100%' },
  revealButton: { minHeight: 44, minWidth: 132, paddingHorizontal: 20, marginTop: 20, borderRadius: 12, backgroundColor: c.greenPale, alignItems: 'center', justifyContent: 'center' }, revealLabel: { fontSize: 14, lineHeight: 22, fontWeight: '600' },
  gradeArea: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4, backgroundColor: c.background },
  fixedGrades: { flexDirection: 'row', gap: 8 }, gradeButton: { flex: 1, minHeight: 46, paddingHorizontal: 8, paddingVertical: 10, borderRadius: 14, backgroundColor: c.surfaceMuted, alignItems: 'center', justifyContent: 'center' }, gradeKnown: { backgroundColor: c.green }, gradeLabel: { fontSize: 14, lineHeight: 22, fontWeight: '600' },
  scoreLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10 }, slider: { height: 36, marginHorizontal: -3 }, pressed: { opacity: 0.7 }, disabled: { opacity: 0.5 },
  submit: { flex: 1, padding: 32, alignItems: 'center', justifyContent: 'center', gap: 14 }, stateWrap: { flex: 1, padding: 20, justifyContent: 'center' }, done: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 16 }, doneActions: { width: '100%', marginTop: 12, gap: 10 },
});
