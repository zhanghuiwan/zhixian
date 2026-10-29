import { AppIcon as Ionicons } from '@/components/app-icon';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Card, EmptyState, ErrorState, IconButton, LoadingView, Metric, Pill, Screen, SectionTitle } from '@/components/ui';
import { radius, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/context/appearance';
import { api } from '@/lib/api';
import type { DayRecord, MonthRecords } from '@/lib/types';

function monthKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
function shiftMonth(value: string, amount: number) { const [year, month] = value.split('-').map(Number); return monthKey(new Date(year, month - 1 + amount, 1)); }
export default function RecordsScreen() {
  const { colors, styles } = useThemedStyles(createStyles);
  const [month, setMonth] = useState(monthKey(new Date())); const [selected, setSelected] = useState('');
  const records = useQuery({ queryKey: ['records', month], queryFn: () => api<MonthRecords>(`/records?month=${month}`) });
  useEffect(() => { if (records.data) setSelected((current) => current.startsWith(month) ? current : records.data!.today.startsWith(month) ? records.data!.today : `${month}-01`); }, [month, records.data]);
  const day = useMemo(() => records.data?.days.find((item) => item.date === selected), [records.data, selected]);
  if (records.isLoading) return <Screen title="学习记录" right={<IconButton icon="close" label="关闭" onPress={() => router.back()} />}><LoadingView label="正在整理学习轨迹" /></Screen>;
  if (records.error || !records.data) return <Screen title="学习记录" right={<IconButton icon="close" label="关闭" onPress={() => router.back()} />}><ErrorState message={(records.error as Error)?.message || '加载失败'} onRetry={() => records.refetch()} /></Screen>;
  const [year, mon] = month.split('-').map(Number); const blanks = new Date(year, mon - 1, 1).getDay();
  return <Screen title="学习记录" right={<IconButton icon="close" label="关闭" onPress={() => router.back()} />} refreshing={records.isFetching} onRefresh={() => records.refetch()}>
    <Card style={styles.calendar}><View style={styles.monthHead}><IconButton icon="chevron-back" label="上个月" onPress={() => setMonth(shiftMonth(month, -1))} /><AppText variant="heading">{year} 年 {mon} 月</AppText><IconButton icon="chevron-forward" label="下个月" onPress={() => setMonth(shiftMonth(month, 1))} /></View><View style={styles.week}>{'日一二三四五六'.split('').map((label) => <AppText key={label} variant="small" color={colors.muted} style={styles.cell}>{label}</AppText>)}</View><View style={styles.grid}>{Array.from({ length: blanks }, (_, index) => <View key={`blank-${index}`} style={styles.dayCell} />)}{records.data.days.map((item) => { const active = item.date === selected; const has = item.word_count + item.reading_count + item.saved_words + item.saved_sentences > 0; return <Pressable accessibilityRole="button" accessibilityLabel={`${item.date}${has ? '有学习记录' : '无记录'}`} key={item.date} onPress={() => setSelected(item.date)} style={[styles.dayCell, active && styles.activeDay]}><AppText variant="label" color={active ? colors.onPrimary : colors.ink}>{Number(item.date.slice(-2))}</AppText>{has ? <View style={[styles.dot, active && { backgroundColor: colors.onPrimary }]} /> : null}</Pressable>; })}</View><View style={styles.timezone}><Ionicons name="time-outline" size={15} color={colors.muted} /><AppText variant="small" color={colors.muted}>日期按 {records.data.timezone} 统计</AppText></View></Card>
    <DayDetail record={day} />
  </Screen>;
}
function DayDetail({ record }: { record?: DayRecord }) {
  const { colors, styles } = useThemedStyles(createStyles);
  if (!record) return null; const has = record.word_count + record.reading_count + record.saved_words + record.saved_sentences > 0;
  const dateLabel = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'UTC' }).format(new Date(`${record.date}T00:00:00Z`));
  if (!has) return <><SectionTitle title={dateLabel} /><EmptyState icon="calendar-clear-outline" title="这一天还没有记录" message="" /></>;
  return <View><SectionTitle title={dateLabel} action={<Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/', params: { prompt: `请分析我 ${record.date} 的学习记录，并给出下一步建议` } })} style={styles.ask}><Ionicons name="leaf-outline" size={15} color={colors.green} /><AppText variant="small" color={colors.green}>闲闲回顾</AppText></Pressable>} /><Card style={styles.metrics}><Metric value={record.new_count} label="新学词" /><Metric value={record.review_count} label="复习词" /><Metric value={record.attempts} label="练习次数" /><Metric value={record.reading_count} label="阅读" /></Card>
    {!!record.books.length && <><SectionTitle title="学习词书" /><Card style={styles.rows}>{record.books.map((book, index) => <View key={`${book.kind}-${book.id}-${index}`} style={styles.row}><AppText>{book.name}</AppText><AppText variant="label" color={colors.green}>{book.word_count} 词</AppText></View>)}</Card></>}
    {!!record.words.length && <><SectionTitle title="单词" /><View style={styles.wordList}>{record.words.map((word) => <Card key={word.id} style={styles.word}><View style={{ flex: 1 }}><AppText variant="label">{word.term}</AppText><AppText variant="small" color={colors.muted} numberOfLines={1}>{word.translation}</AppText></View><Pill tone={word.mode === 'new' ? 'terra' : 'neutral'}>{word.mode === 'new' ? '新学' : '复习'}</Pill></Card>)}</View></>}
    {!!record.articles.length && <><SectionTitle title="阅读" /><Card style={styles.rows}>{record.articles.map((article) => <Pressable accessibilityRole="button" key={article.id} onPress={() => router.push({ pathname: '/article/[id]', params: { id: article.id } })} style={styles.row}><AppText style={{ flex: 1 }}>{article.title}</AppText><AppText variant="label" color={colors.green}>{article.completed ? '已读完' : `${article.percent}%`}</AppText></Pressable>)}</Card></>}
    {(record.saved_words > 0 || record.saved_sentences > 0) && <Card muted style={styles.saved}><Ionicons name="bookmark-outline" size={18} color={colors.green} /><AppText>当天新增 {record.saved_words} 个生词、{record.saved_sentences} 个句子收藏</AppText></Card>}
  </View>;
}
const createStyles = (colors: ThemeColors) => StyleSheet.create({ calendar: { padding: 12 }, monthHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }, week: { flexDirection: 'row' }, cell: { width: '14.285%', textAlign: 'center' }, grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }, dayCell: { width: '14.285%', minHeight: 56, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, gap: 3 }, activeDay: { backgroundColor: colors.green }, dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent }, timezone: { marginTop: 10, flexDirection: 'row', justifyContent: 'center', gap: 5 }, ask: { flexDirection: 'row', gap: 4, alignItems: 'center' }, metrics: { flexDirection: 'row', justifyContent: 'space-between' }, rows: { paddingVertical: 4 }, row: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }, wordList: { gap: 8 }, word: { paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }, saved: { marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 9 } });
