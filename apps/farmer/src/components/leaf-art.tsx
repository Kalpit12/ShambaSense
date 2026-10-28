import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import { color } from '@/theme/tokens';

// Drawn leaves for the preview: sample checks have no real photo, and the preview has no
// agronomist-verified reference photos, so the "Similar case" pane shows a labelled drawing.
// Simplified leaf and lesion colours, as on the landing page (design.md §14).

export type LeafPattern = 'early_blight' | 'late_blight' | 'septoria' | 'tuta' | 'chewed' | 'healthy';

// Flat fills only: gradient ids clash when several drawings share a web page.
const BG = '#24452A';
const LEAF = 'M50 6 C80 20 90 52 74 78 C66 90 56 95 50 96 C44 95 34 90 26 78 C10 52 20 20 50 6Z';
// Fixed spot positions so a drawing looks the same every time.
const SPOTS: [number, number, number][] = [
  [38, 62, 6.5], [60, 70, 5.5], [44, 80, 4.5], [64, 50, 4], [33, 44, 3.5], [56, 34, 3], [70, 64, 3.5],
];
const SPECKS: [number, number][] = [
  [36, 40], [42, 52], [58, 46], [64, 58], [40, 68], [52, 76], [62, 72], [34, 56], [56, 60], [46, 36], [68, 42], [48, 88], [30, 70],
];

/** Square drawing; with no `size` it fills the width it is given. */
export function LeafArt({ pattern, size, style }: { pattern: LeafPattern; size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[size ? { width: size, height: size } : styles.fill, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        <Rect width="100" height="100" fill={BG} />
        <Ellipse cx="18" cy="16" rx="18" ry="9" fill="#2E5530" opacity={0.7} transform="rotate(-30 18 16)" />
        <Ellipse cx="88" cy="86" rx="16" ry="8" fill="#2A4E2C" opacity={0.7} transform="rotate(-35 88 86)" />
        <G transform="rotate(-12 50 50)">
          <Path d={LEAF} fill={pattern === 'late_blight' ? '#5F7E3C' : '#6E9E45'} />
          <Path d="M50 6 C80 20 90 52 74 78 C66 90 56 95 50 96 L50 6Z" fill="#000000" opacity={0.08} />
          {pattern === 'chewed' ? (
            <Path d="M74 78 C70 70 76 66 72 60 C78 58 80 52 84 50 L90 52 Z M26 78 C30 72 24 68 28 62 C22 60 18 52 14 50 L10 52 Z" fill={BG} />
          ) : null}
          <Path d="M50 10 L50 94" stroke="#D9E8B8" strokeWidth={1.4} opacity={0.7} />
          {[24, 36, 48, 60, 72].map((y) => (
            <G key={y} opacity={0.45} stroke="#D9E8B8" strokeWidth={0.9} fill="none">
              <Path d={`M50 ${y + 6} Q40 ${y + 2} 30 ${y - 4}`} />
              <Path d={`M50 ${y + 6} Q60 ${y + 2} 70 ${y - 4}`} />
            </G>
          ))}
          {pattern === 'early_blight'
            ? SPOTS.map(([x, y, r]) => (
                <G key={`${x}-${y}`}>
                  <Circle cx={x} cy={y} r={r + 2.2} fill="#D7C55A" opacity={0.55} />
                  <Circle cx={x} cy={y} r={r} fill="#5A3A1E" />
                  <Circle cx={x} cy={y} r={r * 0.66} fill="none" stroke="#2E1C0E" strokeWidth={0.9} />
                  <Circle cx={x} cy={y} r={r * 0.33} fill="none" stroke="#2E1C0E" strokeWidth={0.8} />
                </G>
              ))
            : null}
          {pattern === 'late_blight' ? (
            <>
              <Path d="M60 20 C76 30 82 50 74 70 C66 66 58 56 56 44 C54 34 56 26 60 20Z" fill="#3A3324" opacity={0.85} />
              <Path d="M30 64 C38 60 46 66 46 76 C46 86 38 90 32 84 C28 78 26 70 30 64Z" fill="#3A3324" opacity={0.8} />
              <Path d="M60 20 C76 30 82 50 74 70" fill="none" stroke="#A8B488" strokeWidth={1.4} opacity={0.6} />
            </>
          ) : null}
          {pattern === 'septoria'
            ? SPECKS.map(([x, y]) => (
                <G key={`${x}-${y}`}>
                  <Circle cx={x} cy={y} r={2.6} fill="#3B2A1A" />
                  <Circle cx={x} cy={y} r={1.3} fill="#CFC7B0" />
                </G>
              ))
            : null}
          {pattern === 'tuta' ? (
            <>
              <Path d="M36 30 C44 34 40 44 48 48 C56 52 52 60 60 62" stroke="#E4E8C8" strokeWidth={6} strokeLinecap="round" fill="none" opacity={0.85} />
              <Path d="M58 30 C64 34 62 40 66 44" stroke="#E4E8C8" strokeWidth={5} strokeLinecap="round" fill="none" opacity={0.8} />
              <Path d="M34 70 C40 72 42 78 50 80" stroke="#E4E8C8" strokeWidth={5} strokeLinecap="round" fill="none" opacity={0.8} />
              {[[44, 46], [57, 60], [40, 74], [63, 41]].map(([x, y]) => (
                <Circle key={`${x}-${y}`} cx={x} cy={y} r={0.9} fill="#2B2B1E" />
              ))}
            </>
          ) : null}
        </G>
      </Svg>
    </View>
  );
}

/** A check photo, or its drawing for preview sample checks. */
export function CheckPhoto({ uri, size, radius = 8, style }: { uri: string; size?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const box = [size ? { width: size, height: size } : styles.fill, { borderRadius: radius }, styles.box, style];
  if (uri.startsWith('sample:')) return <LeafArt pattern={uri.slice(7) as LeafPattern} size={size} style={box} />;
  return (
    <View style={box}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={140} accessibilityIgnoresInvertColors />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', backgroundColor: color.stone200 },
  fill: { width: '100%', aspectRatio: 1 },
});
