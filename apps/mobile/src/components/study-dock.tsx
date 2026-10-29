import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, ProgressBar } from '@/components/ui';
import { useAuth } from '@/context/auth';
import { useThemedStyles } from '@/context/appearance';
import { type ThemeColors } from '@/constants/theme';
import { api } from '@/lib/api';
import type { Dashboard, MonthRecords, StudyQueue } from '@/lib/types';
export function StudyDock() {
  const { colors, styles } = useThemedStyles(createStyles); const { user } = useAuth();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: user?.timezone || 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  const month = `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}`;
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard') });
  const queue = useQuery({ queryKey: ['study-new-preview'], queryFn: () => api<StudyQueue>('/study/queue?limit=50&mode=new') });
  const records = useQuery({ queryKey: ['records', month], queryFn: () => api<MonthRecords>(`/records?month=${month}`) });
  const today = records.data?.days.find((day) => day.date === records.data?.today);
  return <View style={styles.dock}>{(['new', 'review'] as const).map((mode) => {
    const review = mode === 'review'; const query = review ? dashboard : queue;
    const remaining = review ? dashboard.data?.due_today : queue.data?.new_count;
    const done = review ? today?.review_count ?? 0 : today?.new_count ?? 0;
    const total = done + (remaining ?? 0); const color = review ? colors.accentDark : colors.green;
    return <Pressable key={mode} accessibilityRole="button" accessibilityLabel={`${review ? '复习' : '新学'}，${remaining !== undefined ? `${remaining} 个待完成` : '进入学习'}`} onPress={() => router.push({ pathname: '/learn', params: { mode } })} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.75 }]}>
      <View style={styles.head}><AppText variant="label" color={color}>{review ? '复习' : '新学'}</AppText><AppText color={color}>↗</AppText></View>
      <View style={styles.count}><AppText style={styles.number}>{remaining === undefined ? '—' : records.data ? done : remaining}</AppText><AppText variant="small" color={colors.muted}>{remaining === undefined ? '' : records.data ? ` / ${total}` : ' 词'}</AppText></View>
      <ProgressBar value={records.data && total ? done / total * 100 : 0} tone={review ? 'gold' : 'green'} />
      {query.error || query.isLoading ? <AppText variant="small" color={query.error ? colors.danger : colors.muted}>{query.error ? '加载失败' : '加载中…'}</AppText> : null}
    </Pressable>;
  })}</View>;
}
const createStyles = (c: ThemeColors) => StyleSheet.create({
  dock: { flexDirection: 'row', gap: 12 }, tile: { flex: 1, padding: 17, gap: 12, borderRadius: 22, backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }, head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, count: { flexDirection: 'row', alignItems: 'baseline' }, number: { fontSize: 33, lineHeight: 38, fontWeight: '600' },
});
