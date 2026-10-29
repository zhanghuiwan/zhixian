import { CompanionView } from '@/components/companion';
import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AuthScreen, AppText, Brand, Button, Card, TextField } from '@/components/ui';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/context/appearance';
import { useAuth } from '@/context/auth';
import { ApiError } from '@/lib/api';
export default function LoginScreen() {
  const { colors, styles } = useThemedStyles(createStyles);
  const { login, sessionExpired } = useAuth(); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const submit = async () => { if (!email.trim() || !password) { setError('请输入邮箱和密码'); return; } setLoading(true); setError(''); try { await login(email.trim(), password); } catch (value) { setError(value instanceof ApiError ? value.message : '登录失败，请稍后重试'); } finally { setLoading(false); } };
  return <AuthScreen><Brand /><CompanionView size={120} /><View style={styles.heading}><AppText variant="title">登录</AppText></View><Card style={styles.form}>{sessionExpired ? <AppText color={colors.danger}>登录已过期，请重新登录。未完成的学习组仍保存在本机。</AppText> : null}<TextField label="邮箱" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="name@example.com" /><TextField label="密码" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" placeholder="输入密码" />{error ? <AppText variant="small" color={colors.danger}>{error}</AppText> : null}<Button label="登录" onPress={submit} loading={loading} /></Card><AppText style={styles.switch} color={colors.muted}>还没有账号？ <Link href="/register" style={styles.link}>创建账号</Link></AppText></AuthScreen>;
}
const createStyles = (colors: ThemeColors) => StyleSheet.create({ heading: { gap: spacing.sm }, form: { gap: spacing.lg }, switch: { textAlign: 'center' }, link: { color: colors.green, fontWeight: '700' } });
