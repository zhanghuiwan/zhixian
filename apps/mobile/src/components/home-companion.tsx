import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText } from '@/components/ui';
import type { ThemeColors } from '@/constants/theme';
import { useAppearance, useThemedStyles } from '@/context/appearance';

export type HomeCompanionAction = 'idle' | 'wave' | 'think' | 'read' | 'stretch' | 'sleep' | 'umbrella';

export type HomeCompanionProps = {
  action: HomeCompanionAction;
  text: string;
  revision: number;
  onPressCharacter: () => void;
  onPressText: () => void;
  active?: boolean;
  compact?: boolean;
  characterVisible?: boolean;
  disabled?: boolean;
};

const sources = {
  idle: require('../../assets/xianxian/actions/idle.png'),
  wave: require('../../assets/xianxian/actions/wave.png'),
  think: require('../../assets/xianxian/actions/think.png'),
  read: require('../../assets/xianxian/actions/read.png'),
  stretch: require('../../assets/xianxian/actions/stretch.png'),
  sleep: require('../../assets/xianxian/actions/sleep.png'),
  umbrella: require('../../assets/xianxian/actions/umbrella.png'),
} as const;

const actionLabels: Record<HomeCompanionAction, string> = {
  idle: '安静陪伴', wave: '招手', think: '思考', read: '阅读',
  stretch: '伸懒腰', sleep: '休息', umbrella: '撑伞',
};

// One finite gesture per scene change. PNG poses are not skeletal animation.
const motions: Record<HomeCompanionAction, {
  duration: number;
  rotation: number[];
  translateY: number[];
  scaleX: number[];
  scaleY: number[];
}> = {
  idle: { duration: 1800, rotation: [0, 0, 0, 0, 0], translateY: [0, -0.5, -1, -0.5, 0], scaleX: [1, 1.003, 1.006, 1.003, 1], scaleY: [1, 1.005, 1.01, 1.005, 1] },
  wave: { duration: 1100, rotation: [0, -2.5, 2.5, -1.5, 0], translateY: [0, -1, 0, -0.5, 0], scaleX: [1, 1, 1, 1, 1], scaleY: [1, 1, 1, 1, 1] },
  think: { duration: 1400, rotation: [0, -1.5, -2, -1.5, 0], translateY: [0, -0.5, -1, -0.5, 0], scaleX: [1, 1, 1, 1, 1], scaleY: [1, 1, 1, 1, 1] },
  read: { duration: 1800, rotation: [0, 0, 0, 0, 0], translateY: [0, -0.5, -1.5, -0.5, 0], scaleX: [1, 1.002, 1.004, 1.002, 1], scaleY: [1, 1.005, 1.012, 1.005, 1] },
  stretch: { duration: 1300, rotation: [0, -0.5, 0, 0.5, 0], translateY: [0, -1, -3, -1, 0], scaleX: [1, 1.008, 1.02, 1.008, 1], scaleY: [1, 1.012, 1.025, 1.012, 1] },
  sleep: { duration: 2100, rotation: [0, 0, 0, 0, 0], translateY: [0, -0.3, -1, -0.3, 0], scaleX: [1, 1.003, 1.007, 1.003, 1], scaleY: [1, 1.004, 1.012, 1.004, 1] },
  umbrella: { duration: 1500, rotation: [0, 1.5, -1.5, 1, 0], translateY: [0, -0.5, 0, -0.5, 0], scaleX: [1, 1, 1, 1, 1], scaleY: [1, 1, 1, 1, 1] },
};
const gestureRange = [0, 0.25, 0.5, 0.75, 1];

export function HomeCompanion({
  action, text, revision, onPressCharacter, onPressText,
  active = true, compact = false, characterVisible = true, disabled = false,
}: HomeCompanionProps) {
  const { styles } = useThemedStyles(createStyles);
  const { preferences, reduceMotion } = useAppearance();
  const { width } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const showCharacter = preferences.companionEnabled && characterVisible;
  const canAnimate = active && showCharacter && !reduceMotion;
  const motion = motions[action];
  const characterSize = compact ? 136 : width < 360 ? 176 : 208;

  useEffect(() => {
    progress.setValue(0);
    if (!canAnimate) return;
    const gesture = Animated.timing(progress, {
      toValue: 1,
      duration: motion.duration,
      easing: Easing.inOut(Easing.sin),
      useNativeDriver: true,
      isInteraction: false,
    });
    gesture.start();
    return () => {
      gesture.stop();
      progress.setValue(0);
    };
  }, [action, revision, canAnimate, motion.duration, progress]);

  return <View style={[styles.container, compact && styles.compact]}>
    {text.trim() ? <Pressable
      testID="home-companion-dialogue"
      accessibilityRole="button"
      accessibilityLabel={`填入输入框：${text}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPressText}
      style={({ pressed }) => [styles.dialogue, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <AppText style={styles.dialogueText}>{text}</AppText>
    </Pressable> : null}
    {showCharacter ? <Pressable
      testID="home-companion-character"
      accessibilityRole="button"
      accessibilityLabel={`闲闲，${actionLabels[action]}`}
      accessibilityHint="切换动作和话题"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPressCharacter}
      style={({ pressed }) => [styles.character, { width: characterSize, height: characterSize }, pressed && styles.characterPressed]}
    >
      <Animated.View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={[styles.image, {
          transform: [
            { translateY: progress.interpolate({ inputRange: gestureRange, outputRange: motion.translateY }) },
            { rotate: progress.interpolate({ inputRange: gestureRange, outputRange: motion.rotation.map((degrees) => `${degrees}deg`) }) },
            { scaleX: progress.interpolate({ inputRange: gestureRange, outputRange: motion.scaleX }) },
            { scaleY: progress.interpolate({ inputRange: gestureRange, outputRange: motion.scaleY }) },
          ],
        }]}
      >
        <Image
          source={sources[action]}
          contentFit="contain"
          transition={canAnimate ? 200 : 0}
          accessible={false}
          style={styles.image}
        />
      </Animated.View>
    </Pressable> : null}
  </View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { width: '100%', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8 },
  compact: { gap: 4, paddingVertical: 4 },
  dialogue: { width: '100%', maxWidth: 300, minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, backgroundColor: colors.surfaceMuted, justifyContent: 'center' },
  dialogueText: { fontSize: 14, lineHeight: 22, textAlign: 'center', flexShrink: 1 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.55 },
  character: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  characterPressed: { opacity: 0.82 },
  image: { width: '100%', height: '100%' },
});
