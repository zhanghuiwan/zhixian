import { AppIcon as Ionicons } from '@/components/app-icon';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Image, Modal, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, ErrorState, LoadingView, IconButton } from '@/components/ui';
import { CompanionView } from '@/components/companion';
import { GlassContent, GlassSurface } from '@/components/glass';
import { radius, shadows, type ThemeColors } from '@/constants/theme';
import { useAppearance, useThemedStyles } from '@/context/appearance';
import { useAuth } from '@/context/auth';
import { actionLabel, planAIAction, type AIActionPlan } from '@/lib/ai-actions';
import { api, ApiError, streamApi } from '@/lib/api';
import type { AIConversation, AIMessage, AIResponseAction, Article } from '@/lib/types';

type ChatItem = Pick<AIMessage, 'id' | 'role' | 'content' | 'actions'>;
const prompts = ['安排今天怎么学', '解释一个易错词', '推荐一篇短文'];

function cleanInline(value: string) { return value.replace(/\*\*(.*?)\*\*/g, '$1').replace(/__(.*?)__/g, '$1').replace(/`([^`]+)`/g, '$1').trim(); }
function MessageContent({ content, color }: { content: string; color: string }) {
  const { colors, styles } = useThemedStyles(createStyles);
  return <View style={styles.markdown}>{content.split('\n').map((line, index) => {
    const value = line.trim();
    if (!value) return <View key={index} style={styles.paragraphGap} />;
    if (/^\|?[\s:|-]+\|?$/.test(value)) return null;
    if (value.startsWith('|')) return <AppText key={index} variant="small" color={color} style={styles.tableLine}>{value.split('|').map(cleanInline).filter(Boolean).join('  ·  ')}</AppText>;
    const heading = value.match(/^#{1,6}\s+(.+)/);
    if (heading) return <AppText key={index} variant="heading" color={color} style={styles.messageHeading}>{cleanInline(heading[1])}</AppText>;
    const quote = value.match(/^>\s*(.+)/);
    if (quote) return <View key={index} style={[styles.quote, color === colors.onPrimary && styles.quoteOnDark]}><Ionicons name="chatbox-ellipses-outline" size={16} color={color === colors.onPrimary ? colors.onPrimary : colors.green} /><AppText color={color} style={[styles.paragraph, styles.quoteText]}>{cleanInline(quote[1])}</AppText></View>;
    const bullet = value.match(/^[-*]\s+(.+)/);
    if (bullet) return <View key={index} style={styles.bullet}><View style={[styles.bulletDot, { backgroundColor: color === colors.onPrimary ? colors.onPrimary : colors.green }]} /><AppText color={color} style={styles.bulletText}>{cleanInline(bullet[1])}</AppText></View>;
    const ordered = value.match(/^(\d+)[.)]\s+(.+)/);
    if (ordered) return <View key={index} style={styles.bullet}><AppText variant="label" color={color}>{ordered[1]}.</AppText><AppText color={color} style={styles.bulletText}>{cleanInline(ordered[2])}</AppText></View>;
    return <AppText key={index} color={color} style={styles.paragraph}>{cleanInline(value)}</AppText>;
  })}</View>;
}

function ChatBubble({ item, sending, actionPending, onAction, compact = false, onExpand }: { compact?: boolean; onExpand?: (expanded: boolean) => void; item: ChatItem; sending: boolean; actionPending: string | null; onAction: (action: AIResponseAction) => void }) {
  const { colors, styles } = useThemedStyles(createStyles);
  const expandable = compact && item.role === 'assistant' && item.content.length > 180;
  const [expanded, setExpanded] = useState(false);
  const color = item.role === 'user' ? colors.onPrimary : colors.ink;
  return <View style={[styles.message, item.role === 'user' ? styles.userMessage : styles.aiMessage, compact && styles.homeBubble]}>
    {item.role === 'assistant' ? <View style={styles.aiLabel}><View style={styles.aiLeaf}><Ionicons name="leaf" size={14} color={colors.green} /></View><AppText variant="small" color={colors.green}>闲闲</AppText></View> : null}
    <View style={expandable && !expanded ? styles.collapsedMessage : undefined}><MessageContent content={item.content || (sending ? '正在想…' : '')} color={color} /></View>
    {expandable ? <Pressable accessibilityRole="button" onPress={() => { setExpanded(!expanded); onExpand?.(!expanded); }} style={styles.expandButton}><AppText variant="small" color={colors.green}>{expanded ? '收起全文' : '展开全文'}</AppText><Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={colors.green} /></Pressable> : null}
    {item.actions?.length ? <View style={styles.actions}>{item.actions.map((action: AIResponseAction) => <Pressable accessibilityRole="button" key={action.id} disabled={!!actionPending} onPress={() => onAction(action)} style={[styles.action, actionPending === action.id && styles.actionPending]}><AppText variant="small" color={colors.green}>{actionPending === action.id ? '处理中…' : actionLabel(action)}</AppText></Pressable>)}</View> : null}
  </View>;
}

export default function AssistantHome() {
  const { colors, styles } = useThemedStyles(createStyles);
  const { reduceMotion } = useAppearance();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => { const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true)); const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false)); return () => { show.remove(); hide.remove(); }; }, []);
  const params = useLocalSearchParams<{ prompt?: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList>(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [replyExpanded, setReplyExpanded] = useState(false);
  const [homeTurnId, setHomeTurnId] = useState<number | null>(null);
  const retryMessage = useRef('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streamItems, setStreamItems] = useState<ChatItem[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [actionPending, setActionPending] = useState<string | null>(null);
  const today = useQuery({ queryKey: ['conversation-today'], queryFn: () => api<AIConversation | null>('/ai/conversations/today') });
  const messages = useQuery({ queryKey: ['messages', today.data?.id], enabled: !!today.data?.id, queryFn: () => api<AIMessage[]>(`/ai/conversations/${today.data!.id}/messages`) });
  const sourceItems: ChatItem[] = streamItems ?? messages.data ?? [];
  const items = sourceItems.filter((item, index) => {
    const visibleRole = item.role === 'user' || item.role === 'assistant';
    const hasVisibleContent = item.content.trim().length > 0 || !!item.actions?.length;
    return visibleRole && (hasVisibleContent || (sending && index === sourceItems.length - 1 && item.role === 'assistant'));
  });

  // Re-entering the tab shows the greeting, while the conversation stays in history.
  useFocusEffect(useCallback(() => () => {
    setHomeTurnId(null); setReplyExpanded(false); setHistoryVisible(false);
  }, [setHomeTurnId, setReplyExpanded, setHistoryVisible]));

  useEffect(() => { if (params.prompt) setInput(params.prompt); }, [params.prompt]);
  const send = async (preset?: string) => {
    const message = (preset ?? input).trim();
    if (!message || sending) return;
    const temporaryId = -Date.now();
    const localUser: ChatItem = { id: temporaryId, role: 'user', content: message, actions: [] };
    const localAssistant: ChatItem = { id: temporaryId - 1, role: 'assistant', content: '', actions: [] };
    retryMessage.current = message; setHomeTurnId(temporaryId); setReplyExpanded(false); Keyboard.dismiss();
    setInput(''); setError(''); setNotice(''); setSending(true); setStreamItems([...items, localUser, localAssistant]);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    let conversationId = today.data?.id ?? null;
    try {
      await streamApi('/ai/chat/stream', { message, conversation_id: conversationId }, ({ event, data }) => {
        if (event === 'conversation.created' && typeof data.conversation_id === 'number') conversationId = data.conversation_id;
        if (event === 'message.delta' && typeof data.content === 'string') setStreamItems((current) => current?.map((item) => item.id === localAssistant.id ? { ...item, content: item.content + data.content } : item) ?? null);
        if (event === 'message.completed') setStreamItems((current) => current?.map((item) => item.id === localAssistant.id ? { ...item, id: Number(data.message_id) || item.id, content: String(data.content || item.content), actions: (data.actions as AIResponseAction[]) || [] } : item) ?? null);
        if (event === 'error') throw new ApiError(String(data.message || '闲闲暂时无法回答'), 500);
      });
      await queryClient.invalidateQueries({ queryKey: ['conversation-today'] });
      if (conversationId) await queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    } catch (value) {
      setHomeTurnId(null);
      setError(value instanceof Error ? value.message : '闲闲暂时无法回答');
      setStreamItems((current) => current?.filter((item) => item.id !== localAssistant.id) ?? null);
      await queryClient.invalidateQueries({ queryKey: ['conversation-today'] });
      await queryClient.refetchQueries({ queryKey: ['conversation-today'] });
      if (conversationId) {
        await queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        await queryClient.refetchQueries({ queryKey: ['messages', conversationId] });
        setStreamItems(null);
      }
    } finally { setSending(false); }
  };
  const navigate = (plan: Extract<AIActionPlan, { kind: 'navigate' }>) => {
    if (plan.destination === 'article' && plan.id) router.push({ pathname: '/article/[id]', params: { id: plan.id } });
    else if (plan.destination === 'vocabulary' && plan.term) router.push({ pathname: '/vocabulary', params: { createTerm: plan.term } });
    else if (plan.destination === 'home') router.push('/');
    else if (plan.destination === 'learn') router.push('/learn');
    else if (plan.destination === 'articles') router.push('/articles');
    else if (plan.destination === 'wordbooks') router.push('/wordbooks');
    else if (plan.destination === 'sentences') router.push('/sentences');
    else if (plan.destination === 'vocabulary') router.push('/vocabulary');
    else router.push('/study');
  };
  const handleAction = async (action: AIResponseAction) => {
    if (actionPending) return;
    setActionPending(action.id); setError(''); setNotice('');
    try {
      const plan = planAIAction(action);
      if (plan.kind === 'navigate' || ('openArticle' in plan && plan.openArticle)) setHistoryVisible(false);
      if (plan.kind === 'navigate') { navigate(plan); return; }
      const result = await api<Article>(plan.path, { method: 'POST', body: JSON.stringify(plan.body) });
      await Promise.all(plan.invalidate.map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      setNotice(plan.successMessage);
      if (plan.openArticle && result.id) router.push({ pathname: '/article/[id]', params: { id: result.id } });
    } catch (value) { setError(value instanceof Error ? value.message : '操作没有完成，请重试'); }
    finally { setActionPending(null); }
  };

  const turnIndex = items.findIndex((item) => item.id === homeTurnId);
  const currentTurn = turnIndex >= 0 ? items.slice(turnIndex) : [];
  const latestReply = currentTurn.find((item) => item.role === 'assistant');
  const latestQuestion = currentTurn.find((item) => item.role === 'user');
  return <SafeAreaView style={styles.safe} edges={['top']}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}>
        <View><AppText variant="heading">闲闲</AppText></View>
        <IconButton icon="chatbox-outline" label="查看对话历史" onPress={() => { Keyboard.dismiss(); setHomeTurnId(null); setReplyExpanded(false); setHistoryVisible(true); }} />
      </View>
      <GlassContent style={styles.flex}><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.home}>
        {latestQuestion && <AppText variant="small" color={colors.muted} numberOfLines={2} style={{ paddingHorizontal: 8, marginBottom: 8 }}>{latestQuestion.content}</AppText>}
        {latestReply ? <ChatBubble key={latestReply.id} compact onExpand={setReplyExpanded} item={latestReply} sending={sending} actionPending={actionPending} onAction={handleAction} /> : <View style={styles.welcome}><AppText variant="heading" style={{ textAlign: 'center' }}>你好，{user?.nickname || '今天也来啦'}。</AppText></View>}
        <View style={styles.speechTail} />
        {!keyboardVisible && <View style={[styles.openSpace, replyExpanded && { minHeight: 120 }]}><CompanionView size={replyExpanded ? 110 : 200} state={sending ? 'waiting' : 'idle'} /></View>}
        {!currentTurn.length && !keyboardVisible && <View style={styles.prompts}>{prompts.slice(0, 2).map((prompt) => <Pressable accessibilityRole="button" key={prompt} disabled={sending} onPress={() => send(prompt)} style={styles.prompt}><AppText variant="small" color={colors.green}>{prompt}</AppText></Pressable>)}</View>}
      </ScrollView></GlassContent>
      <View style={[styles.composerWrap, { paddingBottom: keyboardVisible ? Math.max(insets.bottom, 10) : 74 + insets.bottom }]}>
        {notice ? <AppText accessibilityLiveRegion="polite" variant="small" color={colors.green}>{notice}</AppText> : null}
        {error ? <View style={styles.feedback}><AppText accessibilityLiveRegion="polite" variant="small" color={colors.danger} style={{ flex: 1 }}>{error}</AppText><Pressable accessibilityRole="button" onPress={() => error.includes('配置') ? router.push('/profile') : send(retryMessage.current)} style={{ minHeight: 44, justifyContent: 'center' }}><AppText variant="small" color={colors.green}>{error.includes('配置') ? '设置' : '重试'}</AppText></Pressable></View> : null}
        <GlassSurface style={styles.composer}><Image source={require('../../../assets/images/wutong-leaf-miniprogram.png')} resizeMode="contain" accessible={false} style={styles.composerLeaf} /><TextInput accessibilityLabel="和闲闲聊聊" value={input} onChangeText={setInput} placeholder={sending ? '闲闲正在想…' : '和闲闲聊聊…'} placeholderTextColor={colors.muted} multiline maxLength={4000} style={styles.input} /><Pressable accessibilityRole="button" accessibilityLabel="发送消息" disabled={!input.trim() || sending} onPress={() => send()} style={[styles.send, (!input.trim() || sending) && styles.sendDisabled]}><Ionicons name={sending ? 'hourglass-outline' : 'arrow-up'} size={20} color={colors.onPrimary} /></Pressable></GlassSurface>
      </View>
    </KeyboardAvoidingView>
    <Modal visible={historyVisible} presentationStyle="fullScreen" animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => setHistoryVisible(false)}><SafeAreaView style={styles.safe}><View style={styles.header}><AppText variant="heading">今天的对话</AppText><IconButton icon="close" label="关闭对话历史" onPress={() => setHistoryVisible(false)} /></View>{today.isLoading || messages.isLoading ? <LoadingView label="正在加载对话" /> : today.error || messages.error ? <ErrorState message={((today.error || messages.error) as Error).message} onRetry={() => { today.refetch(); messages.refetch(); }} /> : items.length ? <FlatList ref={listRef} style={styles.flex} data={items} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.messages} renderItem={({ item }) => <View style={styles.historyRow}><ChatBubble item={item} sending={sending} actionPending={actionPending} onAction={handleAction} /></View>} /> : <View style={styles.emptyHistory}><AppText color={colors.muted}>暂无对话</AppText></View>}</SafeAreaView></Modal>
  </SafeAreaView>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 },
  header: { minHeight: 64, paddingHorizontal: 20, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 }, headerSymbol: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenPale },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 }, headerButton: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  home: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 12, justifyContent: 'center' },
  homeBubble: { width: '100%', maxWidth: '100%', borderBottomLeftRadius: radius.lg }, welcome: { padding: 22, gap: 10, borderRadius: 24, backgroundColor: colors.surface }, speechTail: { alignSelf: 'center', width: 16, height: 16, transform: [{ rotate: '45deg' }], backgroundColor: colors.surface, marginTop: -8 }, feedback: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  speech: { gap: 10, paddingVertical: 18, backgroundColor: colors.background },
  taskLink: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }, openSpace: { minHeight: 224, paddingVertical: 12, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', gap: 10 }, promptMark: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenPale }, promptGuide: { textAlign: 'center' },
  prompts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', paddingTop: 12 }, prompt: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.surface },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  messages: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 24 }, historyRow: { width: '100%', paddingVertical: 8 }, emptyHistory: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { maxWidth: '92%', minWidth: 0, padding: 15, borderRadius: 16, ...shadows },
  userMessage: { alignSelf: 'flex-end', backgroundColor: colors.green, borderBottomRightRadius: 5 },
  aiMessage: { alignSelf: 'flex-start', width: '92%', backgroundColor: colors.surface, borderBottomLeftRadius: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  aiLabel: { marginBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 6 }, aiLeaf: { width: 24, height: 24, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenPale },
  collapsedMessage: { maxHeight: 140, overflow: 'hidden' }, expandButton: { minHeight: 44, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3 },
  markdown: { gap: 2 }, paragraph: { lineHeight: 23 }, paragraphGap: { height: 7 }, messageHeading: { marginTop: 7, marginBottom: 4, fontSize: 17, lineHeight: 22 },
  quote: { marginVertical: 5, padding: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: radius.sm, backgroundColor: colors.greenPale }, quoteOnDark: { backgroundColor: 'rgba(255,255,255,0.12)' }, quoteText: { flex: 1 }, bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 2 }, bulletDot: { width: 5, height: 5, borderRadius: 3, marginTop: 9 }, bulletText: { flex: 1, lineHeight: 23 }, tableLine: { paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  actions: { marginTop: 12, gap: 7, flexDirection: 'row', flexWrap: 'wrap' }, action: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.greenPale }, actionPending: { opacity: 0.58 },
  composerWrap: { paddingHorizontal: 14, paddingTop: 7, paddingBottom: 9, gap: 5, backgroundColor: colors.background },
  composer: { minHeight: 54, padding: 7, paddingLeft: 13, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 30 },
  composerLeaf: { width: 28, height: 28 },
  input: { flex: 1, maxHeight: 112, minHeight: 38, paddingVertical: 8, color: colors.ink, textAlignVertical: 'top', fontSize: 15 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green }, sendDisabled: { backgroundColor: colors.border },
});
