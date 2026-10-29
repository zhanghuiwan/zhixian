import { Platform } from 'react-native';
export const lightColors = {
  background: '#FFFFFF', surface: '#FFFFFF', surfaceMuted: '#F5F5F5', elevated: '#FFFFFF',
  ink: '#202320', inkSoft: '#464D47', muted: '#616762', line: '#DDE1DE', border: '#DDE1DE',
  green: '#536B5C', greenDark: '#405548', greenPale: '#FFFFFF', greenMuted: '#ECECEC',
  accent: '#536B5C', accentDark: '#405548', accentPale: '#FFFFFF', terra: '#616762', terraPale: '#FFFFFF',
  warning: '#766024', danger: '#A3313B', dangerPale: '#FBECEE', white: '#FFFFFF', onPrimary: '#FFFFFF',
  cream: '#FFFFFF', nav: '#FFFFFF', greenWash: '#FFFFFF', overlay: 'rgba(15,20,17,0.42)',
  glass: 'rgba(255,255,255,0.76)', glassBorder: 'rgba(255,255,255,0.9)',
};
export type ThemeColors = typeof lightColors;
export const darkColors: ThemeColors = {
  background: '#161616', surface: '#222222', surfaceMuted: '#2D2D2D', elevated: '#353535',
  ink: '#F3F5F3', inkSoft: '#D2DAD4', muted: '#B4BDB6', line: '#3C453F', border: '#3C453F',
  green: '#A5B7AA', greenDark: '#C1D1C5', greenPale: '#222222', greenMuted: '#3D3D3D',
  accent: '#A5B7AA', accentDark: '#C1D1C5', accentPale: '#222222', terra: '#B4BDB6', terraPale: '#222222',
  warning: '#D3BC7C', danger: '#FFB4BA', dangerPale: '#482C31', white: '#FFFFFF', onPrimary: '#172019',
  cream: '#222222', nav: '#222222', greenWash: '#222222', overlay: 'rgba(0,0,0,0.62)',
  glass: 'rgba(34,34,34,0.82)', glassBorder: 'rgba(230,230,230,0.18)',
};
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;
export const fonts = {
  sans: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }),
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }),
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
} as const;
export const shadows = { elevation: 0 };
