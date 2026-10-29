import { AppIcon } from '@/components/app-icon';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { AppText, IconButton } from '@/components/ui';
import { useAppearance, useThemedStyles } from '@/context/appearance';
import { type ThemeColors } from '@/constants/theme';
import { clampSwipe, finishSwipe, isHorizontalSwipe } from '@/lib/quick-swipe';
import { speakEnglish } from '@/lib/speech';
import type { StudyQueueItem } from '@/lib/types';

type Props = { item: StudyQueueItem; status: 'pending' | 'remembered' | 'retry'; busy: boolean; openId: number | null; onOpen: (id: number | null) => void; onGrade: (id: number, score: number, revealed: boolean) => void };
export function QuickWordRow({ item, status, busy, openId, onOpen, onGrade }: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { reduceMotion } = useAppearance();
  const [expanded, setExpanded] = useState(false);
  const offset = useRef(new Animated.Value(0)).current;
  const position = useRef(0); const origin = useRef(0); const lastSwipe = useRef(0);
  const enabled = status === 'pending' && !busy;
  const move = (value: number) => { position.current = value; offset.setValue(value); };
  const settle = (value: number) => {
    position.current = value;
    if (reduceMotion) offset.setValue(value);
    else Animated.timing(offset, { toValue: value, duration: 160, useNativeDriver: true }).start();
  };
  useEffect(() => { if (openId !== item.word.id || status !== 'pending') { position.current = 0; offset.setValue(0); } }, [item.word.id, offset, openId, status]);
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => enabled && isHorizontalSwipe(g.dx, g.dy),
    onPanResponderGrant: () => { offset.stopAnimation(); origin.current = position.current; onOpen(item.word.id); },
    onPanResponderMove: (_, g) => move(clampSwipe(origin.current + g.dx)),
    onPanResponderRelease: () => {
      lastSwipe.current = Date.now(); const result = finishSwipe(position.current);
      settle(result.offset);
      if (result.score !== null) { onOpen(null); onGrade(item.word.id, result.score, expanded); }
    },
    onPanResponderTerminate: () => { lastSwipe.current = Date.now(); settle(0); onOpen(null); },
  // Gesture handlers use the latest row state; Animated.Value itself is stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [enabled, expanded, item.word.id, onGrade, onOpen, offset, reduceMotion]);
  const answer = (score: number) => { settle(0); onOpen(null); onGrade(item.word.id, score, expanded); };
  return <View style={styles.row}>
    <View style={styles.behind} pointerEvents={enabled ? 'auto' : 'none'}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${item.word.term}：不记得`} disabled={!enabled} onPress={() => answer(0)} style={[styles.swipeAction, styles.forgot]}><AppText variant="label" color={colors.danger}>不记得</AppText></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`${item.word.term}：熟悉`} disabled={!enabled} onPress={() => answer(90)} style={[styles.swipeAction, styles.known]}><AppText variant="label" color={colors.green}>熟悉</AppText></Pressable>
    </View>
    <Animated.View style={{ transform: [{ translateX: offset }] }} {...pan.panHandlers}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${item.word.term}，${status === 'pending' ? '待学习' : status === 'retry' ? '下一轮' : '已记住'}，${expanded ? '收起' : '查看'}释义`} accessibilityState={{ expanded }} onPress={() => { if (Date.now() - lastSwipe.current < 260) return; settle(0); onOpen(null); setExpanded(!expanded); }} style={[styles.face, status !== 'pending' && styles.processed]}>
        <View style={styles.heading}><View style={{ flex: 1, gap: 3 }}><AppText style={styles.term}>{item.word.term}</AppText>{expanded && item.word.phonetic ? <AppText variant="small" color={colors.muted}>{item.word.phonetic}</AppText> : null}</View>{status !== 'pending' ? <AppIcon name={status === 'retry' ? 'refresh' : 'checkmark-circle'} size={17} color={status === 'retry' ? colors.muted : colors.green} /> : null}</View>
        {expanded && <View style={styles.detail}><AppText style={styles.meaning}>{item.word.translation}</AppText>{item.word.example ? <><AppText style={styles.example}>{item.word.example}</AppText><AppText variant="small" color={colors.muted}>{item.word.example_translation}</AppText></> : null}</View>}
      </Pressable>
      {expanded && <View style={styles.expandedActions}><IconButton icon="volume-high-outline" label={`朗读 ${item.word.term}`} onPress={() => speakEnglish(item.word.term)} />{status === 'pending' && <View style={styles.fallback}><Pressable accessibilityRole="button" disabled={!enabled} onPress={() => answer(0)} style={styles.textButton}><AppText variant="small" color={colors.danger}>不记得</AppText></Pressable><Pressable accessibilityRole="button" disabled={!enabled} onPress={() => answer(90)} style={styles.textButton}><AppText variant="small" color={colors.green}>熟悉</AppText></Pressable></View>}</View>}
    </Animated.View>
  </View>;
}
const createStyles = (c: ThemeColors) => StyleSheet.create({
  row: { borderRadius: 12, overflow: 'hidden', backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, marginBottom: 8 },
  behind: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between' }, swipeAction: { width: 76, alignItems: 'center', justifyContent: 'center' }, forgot: { backgroundColor: c.dangerPale }, known: { backgroundColor: c.greenPale },
  face: { backgroundColor: c.surface, paddingHorizontal: 16, paddingVertical: 14, minHeight: 56 }, processed: { backgroundColor: c.surfaceMuted }, heading: { flexDirection: 'row', alignItems: 'center', gap: 12 }, term: { fontSize: 18, lineHeight: 25, fontWeight: '400' }, meaning: { fontSize: 14, lineHeight: 23 }, detail: { marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, gap: 8 }, example: { marginTop: 10, fontSize: 14, lineHeight: 23 }, expandedActions: { backgroundColor: c.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 }, fallback: { flexDirection: 'row', gap: 8 }, textButton: { minHeight: 44, minWidth: 66, justifyContent: 'center', alignItems: 'center', backgroundColor: c.surfaceMuted, borderRadius: 12 },
});
