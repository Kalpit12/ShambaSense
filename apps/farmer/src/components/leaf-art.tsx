import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import { color } from '@/theme/tokens';

// Drawn leaves for the preview: sample checks have no real photo, and the preview has no
// agronomist-verified reference photos, so the "Similar case" pane shows a labelled drawing.
// Simplified leaf and lesion colours, as on the landing page (design.md §14).

export type LeafPattern =
  | 'early_blight' | 'late_blight' | 'septoria' | 'tuta'
  | 'fall_armyworm' | 'maize_streak' | 'mln' | 'nitrogen'
  | 'bean_rust' | 'angular_leaf_spot' | 'aphids'
  | 'black_rot'
  | 'potato_blight' | 'potato_wilt' | 'diamondback'
  | 'chewed' | 'healthy';

// Flat fills only: gradient ids clash when several drawings share a web page.
const BG = '#24452A';
const LEAF = 'M50 6 C80 20 90 52 74 78 C66 90 56 95 50 96 C44 95 34 90 26 78 C10 52 20 20 50 6Z';
// Fixed spot positions so a drawing looks the same every time.
const SPOTS: [number, number, number][] = [
  [38, 62, 6.5], [60, 70, 5.5], [44, 80, 4.5], [64, 50, 4], [33, 44, 3.5], [56, 34, 3], [70, 64, 3.5],
];
// Small spots for rust and angular leaf spot, spread over the blade.
const DOTS: [number, number][] = [
  [34, 34], [44, 30], [58, 32], [66, 40], [38, 46], [48, 44], [60, 50], [70, 54], [32, 58], [42, 60], [54, 62], [66, 66],
  [36, 72], [48, 76], [60, 78], [44, 86], [54, 88], [28, 48], [72, 46], [52, 52],
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
          <Path d={LEAF} fill={pattern === 'late_blight' || pattern === 'potato_blight' ? '#5F7E3C' : pattern === 'mln' ? '#8FA548' : pattern === 'potato_wilt' ? '#8AA35A' : '#6E9E45'} />
          <Path d="M50 6 C80 20 90 52 74 78 C66 90 56 95 50 96 L50 6Z" fill="#000000" opacity={0.08} />
          {pattern === 'chewed' || pattern === 'fall_armyworm' ? (
            <Path d="M74 78 C70 70 76 66 72 60 C78 58 80 52 84 50 L90 52 Z M26 78 C30 72 24 68 28 62 C22 60 18 52 14 50 L10 52 Z" fill={BG} />
          ) : null}
          <Path d="M50 10 L50 94" stroke="#D9E8B8" strokeWidth={1.4} opacity={0.7} />
          {[24, 36, 48, 60, 72].map((y) => (
            <G key={y} opacity={0.45} stroke="#D9E8B8" strokeWidth={0.9} fill="none">
              <Path d={`M50 ${y + 6} Q40 ${y + 2} 30 ${y - 4}`} />
              <Path d={`M50 ${y + 6} Q60 ${y + 2} 70 ${y - 4}`} />
            </G>
          ))}
          {pattern === 'fall_armyworm' ? (
            <>
              {[[40, 40, 6, 4], [58, 54, 7, 4.5], [44, 66, 5, 3.5], [60, 34, 4, 3]].map(([x, y, rx, ry]) => (
                <Ellipse key={`${x}-${y}`} cx={x} cy={y} rx={rx} ry={ry} fill="#D9E3B0" opacity={0.85} transform={`rotate(-20 ${x} ${y})`} />
              ))}
              {[[50, 22], [48, 26], [52, 28], [49, 31]].map(([x, y]) => (
                <Circle key={`${x}-${y}`} cx={x} cy={y} r={1.6} fill="#8A7A4A" />
              ))}
            </>
          ) : null}
          {pattern === 'maize_streak'
            ? [30, 36, 42, 46, 54, 58, 64, 70].map((x, i) => (
                <Path key={x} d={`M${x} ${22 + (i % 3) * 4} L${x + (x < 50 ? -2 : 2)} ${80 - (i % 2) * 6}`} stroke="#E8E39A" strokeWidth={1.6} strokeDasharray="5 3" opacity={0.9} />
              ))
            : null}
          {pattern === 'mln' ? (
            <>
              <Path d="M50 6 C80 20 90 52 74 78 C70 70 74 54 66 40 C60 28 54 16 50 6Z" fill="#D9CF6A" opacity={0.8} />
              <Path d="M50 6 C20 20 10 52 26 78 C30 70 26 54 34 40 C40 28 46 16 50 6Z" fill="#D9CF6A" opacity={0.8} />
              <Path d="M50 6 C80 20 90 52 74 78 M50 6 C20 20 10 52 26 78" stroke="#8A6A3A" strokeWidth={3} fill="none" />
            </>
          ) : null}
          {pattern === 'nitrogen' ? <Path d="M50 6 C60 22 58 44 50 62 C42 44 40 22 50 6Z" fill="#E6D86A" opacity={0.9} /> : null}
          {pattern === 'bean_rust'
            ? DOTS.map(([x, y]) => (
                <G key={`${x}-${y}`}>
                  <Circle cx={x} cy={y} r={2.6} fill="#D9D06A" opacity={0.6} />
                  <Circle cx={x} cy={y} r={1.5} fill="#9A4A1E" />
                </G>
              ))
            : null}
          {pattern === 'angular_leaf_spot'
            ? DOTS.filter((_, i) => i % 2 === 0).map(([x, y]) => <Rect key={`${x}-${y}`} x={x - 2.5} y={y - 2} width={5} height={4} fill="#6E5A3E" stroke="#3E3020" strokeWidth={0.6} />)
            : null}
          {pattern === 'aphids'
            ? [[46, 30], [48, 33], [52, 31], [50, 36], [54, 35], [47, 38], [52, 40], [56, 44], [44, 44], [49, 46], [58, 64], [61, 67], [57, 69]].map(([x, y]) => (
                <Ellipse key={`${x}-${y}`} cx={x} cy={y} rx={1.6} ry={1.1} fill="#2F4A1E" stroke="#1C2C12" strokeWidth={0.3} />
              ))
            : null}
          {pattern === 'black_rot' ? (
            <>
              <Path d="M79 44 L61 53 L80 62 Z" fill="#E2D56A" opacity={0.9} />
              <Path d="M17 54 L38 60 L22 70 Z" fill="#E2D56A" opacity={0.9} />
              <Path d="M77 50 L65 53 M78 57 L66 55 M20 60 L34 60 M22 65 L32 62" stroke="#1E1A12" strokeWidth={1} />
            </>
          ) : null}
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
          {pattern === 'potato_wilt' ? (
            <Path d="M50 6 C80 20 90 52 74 78 C66 90 56 95 50 96 C58 80 66 60 64 40 C62 26 56 14 50 6Z" fill="#B5B060" opacity={0.55} />
          ) : null}
          {pattern === 'diamondback'
            ? DOTS.filter((_, i) => i % 3 !== 1).map(([x, y]) => (
                <Ellipse key={`${x}-${y}`} cx={x} cy={y} rx={2.4} ry={1.7} fill="#DDE6BC" opacity={0.85} />
              ))
            : null}
          {pattern === 'late_blight' || pattern === 'potato_blight' ? (
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
