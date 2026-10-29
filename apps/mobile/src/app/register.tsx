import { CompanionView } from '@/components/companion';
import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AuthScreen, AppText, Brand, Button, Card, TextField } from '@/components/ui';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/context/appearance';
import { useAuth } from '@/context/auth';
import { ApiError } from '@/lib/api';
export default function RegisterScreen() {
  const { colors, styles } = useThemedStyles(createStyles);
  const { register } = useAuth(); const [nickname, setNickname] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const submit = async () => { if (!nickname.trim() || !email.trim() || password.length < 8) { setError('请填写昵称、有效邮箱和至少 8 位密码'); return; } setLoading(true); setError(''); try { await register(email.trim(), password, nickname.trim()); } catch (value) { setError(value instanceof ApiError ? value.message : '注册失败，请稍后重试'); } finally { setLoading(false); } };
  return <AuthScreen><Brand /><CompanionView size={120} /><View style={styles.heading}><AppText variant="title">创建账号</AppText></View><Card style={styles.form}><TextField label="昵称" value={nickname} onChangeText={setNickname} autoComplete="name" placeholder="怎么称呼你" /><TextField label="邮箱" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="name@example.com" /><TextField label="密码" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" placeholder="至少 8 位" />{error ? <AppText variant="small" color={colors.danger}>{error}</AppText> : null}<Button label="创建账号" onPress={submit} loading={loading} /></Card><AppText style={styles.switch} color={colors.muted}>已有账号？ <Link href="/login" style={styles.link}>返回登录</Link></AppText></AuthScreen>;
}
const createStyles = (colors: ThemeColors) => StyleSheet.create({ heading: { gap: spacing.sm }, form: { gap: spacing.lg }, switch: { textAlign: 'center' }, link: { color: colors.green, fontWeight: '700' } });
