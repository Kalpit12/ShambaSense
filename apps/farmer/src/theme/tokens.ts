// Product tokens from design.md v2.0 §5. Keep in sync with packages/ui-tokens once the monorepo exists.
import { Easing } from 'react-native-reanimated';

export const color = {
  stone50: '#F3F4F2',
  stone100: '#E8EBE6',
  stone200: '#D5DAD3',
  stone300: '#B7C0B4',
  stone500: '#6B756E',
  stone600: '#47514B',
  stone800: '#24302A',
  ink: '#14201A',
  forest50: '#E6EFE8',
  forest100: '#CFE0D3',
  forest900: '#0F3D26',
  forest950: '#0B2E1C',
  onForest: '#F4F1E6',
  lime: '#C4EF5A',
  onLime: '#0D110E',
  brandInk: '#0D110E',
  red50: '#FCEBEA',
  red700: '#B42318',
  sky50: '#E7F3F8',
  sky700: '#2A6F97',
  amber50: '#FBF0DC',
  amber800: '#8A5A10',
} as const;

export const font = {
  regular: 'IBMPlexSans_400Regular',
  medium: 'IBMPlexSans_500Medium',
  semibold: 'IBMPlexSans_600SemiBold',
} as const;

// Farmer app scale, 18 px base (§5.3).
export const type = {
  display: { fontFamily: font.semibold, fontSize: 28, lineHeight: 34 },
  title: { fontFamily: font.semibold, fontSize: 22, lineHeight: 28 },
  body: { fontFamily: font.regular, fontSize: 18, lineHeight: 26 },
  bodyEmphasis: { fontFamily: font.semibold, fontSize: 18, lineHeight: 26 },
  meta: { fontFamily: font.medium, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: font.semibold, fontSize: 13, lineHeight: 16 },
} as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 40, 8: 48 } as const;
export const radius = { sm: 8, md: 12, full: 999 } as const;
export const touch = { min: 48, primary: 56 } as const;

// Motion tokens (§5.6). Product motion stays under 240 ms, opacity + small translation, no springs.
const enterCurve = Easing.bezier(0.2, 0.8, 0.2, 1);
export const motion = {
  press: { duration: 80, easing: Easing.out(Easing.quad) },
  color: { duration: 140, easing: Easing.out(Easing.quad) },
  fade: { duration: 140, easing: Easing.out(Easing.quad) },
  enter: { duration: 200, easing: enterCurve },
  sheet: { duration: 240, easing: enterCurve },
  stagger: 40,
} as const;
