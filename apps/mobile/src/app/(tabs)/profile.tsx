import { Sheet, SheetHost } from '@/components/sheet';
import { AppIcon as Ionicons } from '@/components/app-icon';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { AppText, Button, ErrorState, LoadingView, Pill, Screen, SectionTitle, TextField } from '@/components/ui';
import { radius, shadows, type ThemeColors } from '@/constants/theme';
import { useAppearance, useThemedStyles } from '@/context/appearance';
import { useAuth } from '@/context/auth';
import { AppearanceSettings } from '@/components/appearance-settings';
import { api } from '@/lib/api';
import type { AIProviderCatalogItem, AIProviderConfig, AIProviderName, Dashboard, MonthRecords, User } from '@/lib/types';

interface ProviderForm { apiKey: string; model: string; isEnabled: boolean; isDefault: boolean }
interface Connection { status: 'ok'; provider: AIProviderName; model: string; latency_ms: number }

function SettingsRow({ icon, tone = 'green', title, description, onPress, danger = false, trailing }: { icon: keyof typeof Ionicons.glyphMap; tone?: 'green' | 'gold' | 'neutral'; title: string; description?: string; onPress?: () => void; danger?: boolean; trailing?: ReactNode }) {
  const { colors, styles } = useThemedStyles(createStyles);
  const iconColor = danger ? colors.danger : tone === 'gold' ? colors.accentDark : colors.green;
  const content = <><View style={[styles.rowIcon, tone === 'gold' && styles.rowIconGold, tone === 'neutral' && styles.rowIconNeutral, danger && styles.rowIconDanger]}><Ionicons name={icon} size={19} color={iconColor} /></View><View style={styles.rowCopy}><AppText variant="label" color={danger ? colors.danger : colors.ink}>{title}</AppText>{description ? <AppText variant="small" color={colors.muted} numberOfLines={1}>{description}</AppText> : null}</View>{trailing ?? (onPress ? <Ionicons name="chevron-forward" size={17} color={colors.muted} /> : null)}</>;
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.settingsRow, pressed && styles.pressed]}>{content}</Pressable> : <View style={styles.settingsRow}>{content}</View>;
}

function monthKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
function WeekStrip({ records }: { records?: MonthRecords }) {
  const { colors, styles } = useThemedStyles(createStyles);
  const days = useMemo(() => {
    const base = records?.today ? new Date(`${records.today}T00:00:00Z`) : new Date();
    const map = new Map(records?.days.map((day) => [day.date, day]));
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(base); date.setUTCDate(base.getUTCDate() - (6 - index));
      const key = date.toISOString().slice(0, 10); const entry = map.get(key);
      return { key, label: '日一二三四五六'[date.getUTCDay()], day: date.getUTCDate(), active: !!entry && entry.word_count + entry.reading_count > 0, today: key === records?.today };
    });
  }, [records]);
  return <View style={styles.week}>{days.map((day) => <View key={day.key} style={[styles.weekDay, day.active && styles.weekDayActive]}><AppText variant="small" color={colors.muted}>{day.label}</AppText><AppText variant="label" color={day.today ? colors.green : colors.ink}>{day.day}</AppText><View style={[styles.weekDot, day.active && styles.weekDotActive]} /></View>)}</View>;
}

export default function ProfileScreen() {
  const { reduceMotion } = useAppearance();
  const { colors, styles } = useThemedStyles(createStyles);
  const { user, logout, refreshUser } = useAuth();
  const client = useQueryClient();
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [daily, setDaily] = useState(String(user?.daily_new_words || 10));
  const [notice, setNotice] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<AIProviderName | null>(null);
  const catalog = useQuery({ queryKey: ['provider-catalog'], queryFn: () => api<AIProviderCatalogItem[]>('/ai/providers/catalog') });
  const configs = useQuery({ queryKey: ['provider-configs'], queryFn: () => api<AIProviderConfig[]>('/ai/providers') });
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard') });
  const records = useQuery({ queryKey: ['records', monthKey(new Date())], queryFn: () => api<MonthRecords>(`/records?month=${monthKey(new Date())}`) });
  const configMap = useMemo(() => new Map(configs.data?.map((item) => [item.provider, item])), [configs.data]);
  const [forms, setForms] = useState<Partial<Record<AIProviderName, ProviderForm>>>({});

  useEffect(() => {
    if (!catalog.data) return;
    setForms((current) => Object.fromEntries(catalog.data.map((item) => {
      const saved = configMap.get(item.provider); const previous = current[item.provider];
      return [item.provider, { apiKey: previous?.apiKey || '', model: saved?.model || previous?.model || item.default_model, isEnabled: saved?.is_enabled ?? previous?.isEnabled ?? true, isDefault: saved?.is_default ?? previous?.isDefault ?? false }];
    })));
  }, [catalog.data, configMap]);

  const saveProfile = useMutation({
    mutationFn: () => api<User>('/users/me', { method: 'PATCH', body: JSON.stringify({ nickname: nickname.trim(), daily_new_words: Number(daily) }) }),
    onSuccess: async () => { await refreshUser(); setNotice('学习设置已保存'); setEditingProfile(false); },
    onError: (value) => setNotice((value as Error).message),
  });
  const update = (provider: AIProviderName, changes: Partial<ProviderForm>) => setForms((current) => current[provider] ? { ...current, [provider]: { ...current[provider]!, ...changes } } : current);
  const saveProvider = async (provider: AIProviderName) => {
    const form = forms[provider]; const existing = configMap.get(provider); if (!form) return;
    if (!existing && !form.apiKey.trim()) { setNotice('首次配置模型时需要填写 API Key'); return; }
    try {
      await api(`/ai/providers/${provider}`, { method: 'PUT', body: JSON.stringify({ ...(form.apiKey.trim() ? { api_key: form.apiKey.trim() } : {}), model: form.model, is_enabled: form.isEnabled, is_default: form.isDefault }) });
      update(provider, { apiKey: '' }); await configs.refetch(); setNotice('模型配置已加密保存');
    } catch (cause) { setNotice((cause as Error).message); }
  };
  const testProvider = async (provider: AIProviderName) => {
    try { const result = await api<Connection>(`/ai/providers/${provider}/test`, { method: 'POST' }); setNotice(`连接成功 · ${result.model} · ${result.latency_ms} ms`); }
    catch (cause) { setNotice((cause as Error).message); }
  };
  const deleteProvider = (item: AIProviderCatalogItem) => Alert.alert('删除模型配置', `确定删除 ${item.display_name} 配置吗？`, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: async () => { await api(`/ai/providers/${item.provider}`, { method: 'DELETE' }); await configs.refetch(); setActiveProvider(null); setNotice('模型配置已删除'); } }]);

  if (catalog.isLoading || configs.isLoading || dashboard.isLoading) return <Screen title="我的"><LoadingView /></Screen>;
  if (catalog.error || configs.error || dashboard.error) return <Screen title="我的"><ErrorState message={((catalog.error || configs.error || dashboard.error) as Error).message} onRetry={() => { catalog.refetch(); configs.refetch(); dashboard.refetch(); }} /></Screen>;

  const activeItem = catalog.data?.find((item) => item.provider === activeProvider);
  const activeConfig = activeProvider ? configMap.get(activeProvider) : undefined;
  const activeForm = activeProvider ? forms[activeProvider] : undefined;
  const defaultConfig = configs.data?.find((item) => item.is_default) ?? configs.data?.[0];
  const configuredProviders = configs.data?.length ?? 0;
  const recentDates = records.data?.today ? Array.from({ length: 7 }, (_, index) => { const date = new Date(`${records.data!.today}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - index); return date.toISOString().slice(0, 10); }) : [];
  const activeDays = records.data?.days.filter((day) => recentDates.includes(day.date) && day.word_count + day.reading_count > 0).length ?? 0;

  return <>
    <Screen title="我的">
      <View style={styles.profileCard}>
        <View style={styles.profileCopy}>
          <View style={styles.userLine}><View style={styles.avatar}><AppText style={styles.avatarText}>闲</AppText><Ionicons name="leaf" size={13} color={colors.green} style={styles.avatarLeaf} /></View><View style={styles.identity}><AppText variant="heading">{user?.nickname || '知闲用户'}</AppText><AppText variant="small" color={colors.inkSoft} numberOfLines={1}>{user?.email}</AppText></View></View>
        </View>
      </View>

      <View style={styles.summary}>
        <View style={styles.summaryCell}><AppText style={styles.summaryValue}>{dashboard.data?.studied_today ?? 0}</AppText><AppText variant="small" color={colors.muted}>今日学习</AppText></View><View style={styles.summaryDivider} />
        <View style={styles.summaryCell}><AppText style={styles.summaryValue}>{dashboard.data?.mastered_words ?? 0}</AppText><AppText variant="small" color={colors.muted}>累计掌握</AppText></View><View style={styles.summaryDivider} />
        <View style={styles.summaryCell}><AppText style={styles.summaryValue}>{dashboard.data?.vocabulary_count ?? 0}</AppText><AppText variant="small" color={colors.muted}>生词数量</AppText></View>
      </View>

      <Pressable accessibilityRole="button" onPress={() => router.push('/records')} style={({ pressed }) => [styles.activity, pressed && styles.pressed]}>
        <View style={styles.activityHead}><View><AppText variant="heading">最近七天</AppText><AppText variant="small" color={colors.muted}>{activeDays} 天有学习记录</AppText></View><AppText variant="small" color={colors.green}>学习记录 ›</AppText></View>
        <WeekStrip records={records.data} />
      </Pressable>

      {notice ? <View style={[styles.notice, (notice.includes('失败') || notice.includes('需要')) && styles.noticeError]}><Ionicons name="information-circle-outline" size={17} color={notice.includes('失败') || notice.includes('需要') ? colors.danger : colors.green} /><AppText variant="small" style={{ flex: 1 }}>{notice}</AppText><Pressable accessibilityRole="button" accessibilityLabel="关闭提示" onPress={() => setNotice('')}><Ionicons name="close" size={16} color={colors.muted} /></Pressable></View> : null}


      <AppearanceSettings />
      <SectionTitle title="学习与助手" />
      <View style={styles.group}>
        <SettingsRow icon="options-outline" title="学习偏好" description={`每天 ${user?.daily_new_words ?? 10} 个新词`} onPress={() => setEditingProfile(true)} />
        <SettingsRow icon="leaf-outline" tone="gold" title="闲闲模型" description={defaultConfig ? `${defaultConfig.display_name} · ${defaultConfig.model}` : undefined} onPress={() => { setActiveProvider(null); setModelSettingsOpen(true); }} trailing={<View style={styles.providerStatus}><Pill tone={configuredProviders ? 'green' : 'neutral'}>{configuredProviders ? `${configuredProviders} 个已配置` : '待配置'}</Pill><Ionicons name="chevron-forward" size={17} color={colors.muted} /></View>} />
      </View>

      <SectionTitle title="账号" />
      <View style={styles.group}><SettingsRow icon="mail-outline" tone="neutral" title="登录邮箱" description={user?.email} /><SettingsRow icon="log-out-outline" title="退出登录" danger onPress={() => Alert.alert('退出登录', '确定退出当前账号吗？', [{ text: '取消', style: 'cancel' }, { text: '退出', style: 'destructive', onPress: async () => { client.clear(); await logout(); } }])} /></View>
    </Screen>

    <Modal visible={editingProfile} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={() => setEditingProfile(false)}><SheetHost>
      <View style={styles.modalRoot}><Pressable style={styles.overlay} onPress={() => setEditingProfile(false)}><Sheet style={styles.sheet}><View style={styles.grabber} /><View style={styles.sheetHeader}><View><AppText variant="heading">学习设置</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="关闭" onPress={() => setEditingProfile(false)} style={styles.close}><Ionicons name="close" size={21} color={colors.green} /></Pressable></View><View style={styles.sheetContent}><TextField label="昵称" value={nickname} onChangeText={setNickname} /><TextField label="每天新词数（1–50）" value={daily} onChangeText={setDaily} keyboardType="number-pad" /><Button label="保存设置" onPress={() => saveProfile.mutate()} disabled={!nickname.trim() || Number(daily) < 1 || Number(daily) > 50} loading={saveProfile.isPending} /></View></Sheet></Pressable></View>
    </SheetHost></Modal>

    <Modal visible={modelSettingsOpen} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={() => { setModelSettingsOpen(false); setActiveProvider(null); }}><SheetHost>
      <View style={styles.modalRoot}>
        <Pressable style={styles.overlay} onPress={() => { setModelSettingsOpen(false); setActiveProvider(null); }}>
          <Sheet style={[styles.sheet, styles.providerSheet]}>
            <View style={styles.grabber} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleLine}>{activeProvider ? <Pressable accessibilityRole="button" accessibilityLabel="返回模型列表" onPress={() => setActiveProvider(null)} style={styles.back}><Ionicons name="chevron-back" size={20} color={colors.green} /></Pressable> : null}<View><AppText variant="heading">{activeItem?.display_name ?? '闲闲模型'}</AppText></View></View>
              <Pressable accessibilityRole="button" accessibilityLabel="关闭" onPress={() => { setModelSettingsOpen(false); setActiveProvider(null); }} style={styles.close}><Ionicons name="close" size={21} color={colors.green} /></Pressable>
            </View>
            {activeItem && activeProvider && activeForm ? <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}><TextField label="模型" value={activeForm.model} onChangeText={(model) => update(activeProvider, { model })} placeholder={activeItem.models.join(' / ')} /><TextField label="API Key" value={activeForm.apiKey} onChangeText={(apiKey) => update(activeProvider, { apiKey })} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder={activeConfig ? `${activeConfig.masked_api_key}（留空则不修改）` : '填写厂商 API Key'} /><View style={styles.switchLine}><View><AppText variant="label">启用该厂商</AppText></View><Switch value={activeForm.isEnabled} onValueChange={(isEnabled) => update(activeProvider, { isEnabled, ...(!isEnabled ? { isDefault: false } : {}) })} trackColor={{ false: colors.surfaceMuted, true: colors.greenPale }} thumbColor={activeForm.isEnabled ? colors.green : colors.muted} /></View><View style={styles.line} /><View style={styles.switchLine}><View><AppText variant="label">设为默认模型</AppText></View><Switch value={activeForm.isDefault} onValueChange={(isDefault) => update(activeProvider, { isDefault, ...(isDefault ? { isEnabled: true } : {}) })} trackColor={{ false: colors.surfaceMuted, true: colors.accentPale }} thumbColor={activeForm.isDefault ? colors.accent : colors.muted} /></View><Button label="保存配置" onPress={() => saveProvider(activeProvider)} /><Button label="测试连接" variant="secondary" disabled={!activeConfig} onPress={() => testProvider(activeProvider)} />{activeConfig ? <Button label="删除配置" variant="danger" onPress={() => deleteProvider(activeItem)} /> : null}</ScrollView> : <View style={styles.modelList}><View style={styles.group}>{catalog.data?.map((item) => { const config = configMap.get(item.provider); return <SettingsRow key={item.provider} icon="leaf-outline" tone="gold" title={item.display_name} description={config ? config.model : '尚未配置'} onPress={() => setActiveProvider(item.provider)} trailing={<View style={styles.providerStatus}>{config?.is_default ? <Pill tone="terra">默认</Pill> : config ? <Pill>已配置</Pill> : <Pill tone="neutral">待配置</Pill>}<Ionicons name="chevron-forward" size={17} color={colors.muted} /></View>} />; })}</View><AppText variant="small" color={colors.muted}>API Key 只保存在服务器的加密配置中。</AppText></View>}
          </Sheet>
        </Pressable>
      </View>
    </SheetHost></Modal>
  </>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  profileCard: { minHeight: 104, padding: 20, justifyContent: 'center', borderRadius: radius.lg, backgroundColor: colors.surface, ...shadows },
  profileCopy: { width: '100%' }, userLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenMuted }, avatarText: { fontSize: 22, lineHeight: 27, fontWeight: '700', color: colors.green }, avatarLeaf: { position: 'absolute', right: 1, top: -4, transform: [{ rotate: '24deg' }] },
  identity: { flex: 1, minWidth: 0, gap: 3 },
  summary: { minHeight: 92, marginTop: 16, flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, backgroundColor: colors.surface, ...shadows },
  summaryCell: { flex: 1, alignItems: 'center', gap: 4 }, summaryValue: { fontSize: 28, lineHeight: 32, fontWeight: '700', color: colors.ink }, summaryDivider: { width: StyleSheet.hairlineWidth, height: 42, backgroundColor: colors.line },
  activity: { marginTop: 16, padding: 18, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadows }, activityHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  week: { marginTop: 17, flexDirection: 'row', justifyContent: 'space-between' }, weekDay: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 11 }, weekDayActive: { backgroundColor: colors.greenPale }, weekDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.border }, weekDotActive: { backgroundColor: colors.green },
  notice: { marginTop: 12, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.md, backgroundColor: colors.greenPale }, noticeError: { backgroundColor: colors.dangerPale },
  group: { overflow: 'hidden', borderRadius: radius.lg, backgroundColor: colors.surface, ...shadows }, settingsRow: { minHeight: 72, marginLeft: 16, paddingVertical: 13, paddingRight: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenPale }, rowIconGold: { backgroundColor: colors.accentPale }, rowIconNeutral: { backgroundColor: colors.surfaceMuted }, rowIconDanger: { backgroundColor: colors.dangerPale },
  rowCopy: { minWidth: 0, flex: 1, gap: 2 }, providerStatus: { flexDirection: 'row', alignItems: 'center', gap: 7 }, pressed: { opacity: 0.7 },
  modalRoot: { flex: 1 }, overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay }, sheet: { maxHeight: '88%', paddingHorizontal: 22, paddingBottom: 28, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.background }, providerSheet: { minHeight: '62%' },
  grabber: { width: 38, height: 4, alignSelf: 'center', marginTop: 9, marginBottom: 16, borderRadius: 2, backgroundColor: colors.border }, sheetHeader: { paddingBottom: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, sheetTitleLine: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 }, close: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenPale }, back: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }, sheetContent: { gap: 15, paddingBottom: 16 }, modelList: { gap: 12 }, switchLine: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }, line: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
});
