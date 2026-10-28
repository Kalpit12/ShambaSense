import Svg, { G, Path, Rect } from 'react-native-svg';

import { color } from '@/theme/tokens';
import { WORDMARK_PATH } from './wordmark-path';

// Contour S bands, from logo/final/svg. Never animate the bands or add effects (design.md §4.1).
const BANDS = [
  'M27.69 10.92A4.5 4.5 0 1 0 24 18A16.5 16.5 0 1 1 10.48 43.96',
  'M32.6 7.48A10.5 10.5 0 1 0 24 24A10.5 10.5 0 1 1 15.4 40.52',
  'M37.52 4.04A16.5 16.5 0 1 0 24 30A4.5 4.5 0 1 1 20.31 37.08',
];

function Bands() {
  return (
    <G transform="translate(24 24) scale(0.66) translate(-24 -24)" fill="none" stroke={color.lime} strokeWidth={4}>
      {BANDS.map((d) => (
        <Path key={d} d={d} />
      ))}
    </G>
  );
}

/** Rounded forest tile with lime bands. Use above 24 px; below that use the 2-band asset. */
export function BrandTile({ size = 48 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityLabel="ShambaSense" role="img">
      <Rect width={48} height={48} rx={12.96} fill={color.forest900} />
      <Bands />
    </Svg>
  );
}

/** Lime bands alone, for the splash on a forest ground. */
export function BrandMark({ size = 96 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityLabel="ShambaSense" role="img">
      <Bands />
    </Svg>
  );
}

/** Tile + lowercase wordmark, for dark or photo backgrounds (the "-on-dark" lockup). */
export function LockupOnDark({ height = 32 }: { height?: number }) {
  const width = (height * 324.72) / 48;
  return (
    <Svg width={width} height={height} viewBox="0 0 324.72 48" accessibilityLabel="ShambaSense" role="img">
      <Rect width={48} height={48} rx={12.96} fill={color.forest900} />
      <Bands />
      <Path transform="translate(62 34.5)" d={WORDMARK_PATH} fill={color.onForest} />
    </Svg>
  );
}

/** Same lockup with an ink wordmark, for cream and stone backgrounds. */
export function LockupOnLight({ height = 32 }: { height?: number }) {
  const width = (height * 324.72) / 48;
  return (
    <Svg width={width} height={height} viewBox="0 0 324.72 48" accessibilityLabel="ShambaSense" role="img">
      <Rect width={48} height={48} rx={12.96} fill={color.forest900} />
      <Bands />
      <Path transform="translate(62 34.5)" d={WORDMARK_PATH} fill={color.brandInk} />
    </Svg>
  );
}
