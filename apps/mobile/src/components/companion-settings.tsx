import { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { AppText, Button, IconButton, TextField } from '@/components/ui';
import { Sheet, SheetHost } from '@/components/sheet';
import { useAppearance, useThemedStyles } from '@/context/appearance';
import { type ThemeColors } from '@/constants/theme';
import { type CompanionMood, type CompanionWeather } from '@/lib/companion-context';
import { searchCities, type CompanionCity } from '@/lib/companion-weather';

const moods: { value: CompanionMood; label: string }[] = [
  { value: 'auto', label: '随心' }, { value: 'calm', label: '平静' },
  { value: 'cheerful', label: '开心' }, { value: 'focused', label: '专注' },
  { value: 'tired', label: '有点累' },
];
const weatherNames: Record<CompanionWeather, string> = {
  unknown: '天气暂不可用', clear: '晴', cloudy: '多云', rain: '雨', snow: '雪', storm: '雷雨',
};

type Props = {
  visible: boolean; onClose: () => void; mood: CompanionMood; setMood: (mood: CompanionMood) => void;
  city: CompanionCity | null; setCity: (city: CompanionCity | null) => void;
  weatherKind: CompanionWeather; weatherStatus: 'unset' | 'loading' | 'ready' | 'error';
  weatherError: string; refreshWeather: () => void;
};

export function CompanionSettings({ visible, onClose, mood, setMood, city, setCity, weatherKind, weatherStatus, weatherError, refreshWeather }: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { reduceMotion } = useAppearance();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CompanionCity[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searched, setSearched] = useState(false);
  const request = useRef<AbortController | null>(null);
  const revision = useRef(0);
  useEffect(() => () => { revision.current++; request.current?.abort(); }, []);
  useEffect(() => {
    if (!visible) {
      revision.current++; request.current?.abort(); setQuery(''); setResults([]);
      setSearching(false); setSearched(false); setSearchError('');
    }
  }, [visible]);
  const changeQuery = (value: string) => {
    revision.current++; request.current?.abort(); setQuery(value);
    setResults([]); setSearching(false); setSearched(false); setSearchError('');
  };
  const search = async () => {
    if (query.trim().length < 2 || searching) return;
    const id = ++revision.current; request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setSearching(true); setSearchError(''); setSearched(false); setResults([]);
    try {
      const cities = await searchCities(query.trim(), { signal: controller.signal });
      if (id === revision.current && !controller.signal.aborted) { setResults(cities); setSearched(true); }
    } catch {
      if (id === revision.current && !controller.signal.aborted) setSearchError('城市搜索失败，请重试');
    } finally { if (id === revision.current) setSearching(false); }
  };
  const selectCity = (value: CompanionCity) => {
    setCity(value); changeQuery('');
  };
  return <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onClose}>
    <SheetHost><View style={styles.backdrop}>
      <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={onClose} />
      <Sheet style={styles.sheet}>
        <View style={styles.header}><AppText variant="heading">陪伴</AppText><IconButton icon="close" label="关闭陪伴设置" onPress={onClose} /></View>
        <AppText variant="label">心情</AppText>
        <View accessibilityRole="radiogroup" accessibilityLabel="陪伴心情" style={styles.moods}>
          {moods.map((item) => <Pressable key={item.value} accessibilityRole="radio" aria-checked={mood === item.value} accessibilityState={{ checked: mood === item.value }} onPress={() => setMood(item.value)} style={({ pressed }) => [styles.mood, mood === item.value && styles.selected, pressed && styles.pressed]}>
            <AppText color={mood === item.value ? colors.onPrimary : colors.ink}>{item.label}</AppText>
          </Pressable>)}
        </View>
        <AppText variant="label">天气城市</AppText>
        {city ? <View style={styles.city}><View style={styles.cityCopy}><AppText>{city.name}</AppText>
          <AppText variant="small" color={colors.muted}>{weatherStatus === 'loading' ? '正在获取天气' : weatherStatus === 'error' ? '天气暂不可用' : weatherNames[weatherKind]}</AppText>
        </View><Button variant="ghost" label="移除城市" onPress={() => setCity(null)} /></View> : null}
        <TextField label="搜索城市" value={query} onChangeText={changeQuery} placeholder="输入城市名" returnKeyType="search" onSubmitEditing={() => void search()} maxLength={64} autoCorrect={false} />
        <Button label="搜索" variant="secondary" disabled={query.trim().length < 2} loading={searching} onPress={() => void search()} />
        {results.map((result) => <Pressable accessibilityRole="button" accessibilityLabel={`选择城市${result.name}，${[result.admin1, result.country].filter(Boolean).join('，')}`} key={result.id} onPress={() => selectCity(result)} style={({ pressed }) => [styles.result, pressed && styles.pressed]}><AppText>{result.name}</AppText><AppText variant="small" color={colors.muted}>{[result.admin1, result.country].filter(Boolean).join(' · ')}</AppText></Pressable>)}
        {searched && !results.length ? <AppText color={colors.muted}>未找到城市</AppText> : null}
        {searchError ? <AppText accessibilityLiveRegion="polite" color={colors.danger}>{searchError}</AppText> : null}
        {city && weatherStatus === 'error' ? <View style={styles.retry}><AppText variant="small" color={colors.danger} style={styles.cityCopy}>{weatherError || '天气获取失败'}</AppText><Button variant="ghost" label="重试天气" onPress={refreshWeather} /></View> : null}
        <AppText variant="small" color={colors.muted}>仅使用所选城市，不读取定位。</AppText>
        <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL('https://open-meteo.com/').catch(() => setSearchError('暂时无法打开天气来源')); }} style={styles.source}><AppText variant="small" color={colors.green}>天气：Open-Meteo</AppText></Pressable>
      </Sheet>
    </View></SheetHost>
  </Modal>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  sheet: { padding: 20, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  moods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mood: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.surface, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  selected: { backgroundColor: colors.green, borderColor: colors.green }, pressed: { opacity: 0.65 },
  city: { flexDirection: 'row', alignItems: 'center', gap: 12 }, cityCopy: { flex: 1, gap: 3 },
  result: { paddingVertical: 12, minHeight: 56, gap: 3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  source: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
});
