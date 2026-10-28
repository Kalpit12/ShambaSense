import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { color, font, radius, space, type } from '@/theme/tokens';

// Charts in the style of bklit.com (thin monotone lines, soft gradient fills, dashed grid,
// rounded rings, legend bars), drawn with react-native-svg because bklit itself is web-only (visx + DOM).

const reveal = Easing.bezier(0.85, 0, 0.15, 1);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/* ---------------------------------------------------------------- area chart */

export type Series = { key: string; label: string; values: number[]; stroke: string; fill?: string; dashed?: boolean };

/**
 * Smooth area/line chart. Lines reveal left to right (900 ms); touching and dragging shows a
 * crosshair with each series' value in a pill above the chart.
 */
export function AreaChart({
  series,
  labels,
  height = 132,
  onDark,
  format,
}: {
  series: Series[];
  labels: string[];
  height?: number;
  onDark?: boolean;
  format: (n: number) => string;
}) {
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (width > 0 && !reduced) progress.value = withDelay(150, withTiming(1, { duration: 900, easing: reveal }));
  }, [width, reduced, progress]);

  const clip = useAnimatedStyle(() => ({ width: width * progress.value }));

  const n = labels.length;
  const padTop = 8;
  const plotH = height - padTop - 2;
  const max = Math.max(1, ...series.flatMap((s) => s.values)) * 1.12;
  const x = (i: number) => (n <= 1 ? width / 2 : (i / (n - 1)) * (width - 8) + 4);
  const y = (v: number) => padTop + plotH - (v / max) * plotH;

  const paths = useMemo(
    () =>
      series.map((s) => {
        const pts = s.values.map((v, i) => [x(i), y(v)] as const);
        const line = monotonePath(pts);
        const area = pts.length ? `${line} L${pts[pts.length - 1][0]},${height} L${pts[0][0]},${height} Z` : '';
        return { ...s, line, area };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, width, height, max],
  );

  const grid = onDark ? 'rgba(244,241,230,0.14)' : color.stone200;
  const muted = onDark ? 'rgba(244,241,230,0.6)' : color.stone500;

  const pick = (e: GestureResponderEvent) => {
    if (!width || n === 0) return;
    const px = e.nativeEvent.locationX;
    setActive(Math.max(0, Math.min(n - 1, Math.round(((px - 4) / (width - 8)) * (n - 1)))));
  };

  return (
    <View>
      <View
        style={{ height }}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={pick}
        onResponderMove={pick}
        onResponderRelease={() => setActive(null)}
        onResponderTerminate={() => setActive(null)}
        accessible
        accessibilityRole="image"
        accessibilityLabel={series.map((s) => `${s.label} ${format(s.values.reduce((a, b) => a + b, 0))}`).join(', ')}>
        {width > 0 ? (
          <>
            <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
              {[0.25, 0.5, 0.75, 1].map((f) => (
                <Line key={f} x1={0} x2={width} y1={padTop + plotH * f} y2={padTop + plotH * f} stroke={grid} strokeWidth={1} strokeDasharray="4,4" />
              ))}
            </Svg>
            <Animated.View style={[styles.clip, { height }, clip]}>
              <Svg width={width} height={height}>
                <Defs>
                  {paths.map((p) =>
                    p.fill ? (
                      <LinearGradient key={p.key} id={`fill-${p.key}`} x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={p.fill} stopOpacity={0.38} />
                        <Stop offset="1" stopColor={p.fill} stopOpacity={0} />
                      </LinearGradient>
                    ) : null,
                  )}
                </Defs>
                {paths.map((p) => (p.fill ? <Path key={`a-${p.key}`} d={p.area} fill={`url(#fill-${p.key})`} /> : null))}
                {paths.map((p) => (
                  <Path
                    key={`l-${p.key}`}
                    d={p.line}
                    stroke={p.stroke}
                    strokeWidth={p.dashed ? 1.5 : 2.25}
                    strokeDasharray={p.dashed ? '5,5' : undefined}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </Svg>
            </Animated.View>
            {active != null ? (
              <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
                <Line x1={x(active)} x2={x(active)} y1={0} y2={height} stroke={muted} strokeWidth={1} />
                {series.map((s) => (
                  <Circle key={s.key} cx={x(active)} cy={y(s.values[active])} r={4.5} fill={onDark ? color.forest950 : '#FFFFFF'} stroke={s.stroke} strokeWidth={2} />
                ))}
              </Svg>
            ) : null}
          </>
        ) : null}
      </View>
      <View style={styles.axis}>
        {active != null ? (
          <View style={[styles.pill, onDark && styles.pillDark]}>
            <Text style={[styles.pillLabel, onDark && styles.onDarkText]}>{labels[active]}</Text>
            {series.map((s) => (
              <View key={s.key} style={styles.pillItem}>
                <View style={[styles.dot, { backgroundColor: s.stroke }]} />
                <Text style={[styles.pillValue, onDark && styles.onDarkText]}>{format(s.values[active])}</Text>
              </View>
            ))}
          </View>
        ) : (
          [0, Math.floor((n - 1) / 2), n - 1].map((i, k) => (
            <Text key={k} style={[styles.axisLabel, { color: muted, textAlign: k === 0 ? 'left' : k === 1 ? 'center' : 'right' }]}>
              {labels[i]}
            </Text>
          ))
        )}
      </View>
    </View>
  );
}

/** Fritsch–Carlson monotone cubic, the same curve as d3's curveMonotoneX: smooth, no overshoot. */
function monotonePath(pts: readonly (readonly [number, number])[]) {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const dx: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    m.push((pts[i + 1][1] - pts[i][1]) / dx[i]);
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]));
  t.push(m[n - 2]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i][0] + h},${pts[i][1] + h * t[i]} ${pts[i + 1][0] - h},${pts[i + 1][1] - h * t[i + 1]} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

/* ---------------------------------------------------------------- rings */

export type Ring = { key: string; value: number; color: string };

/** Concentric progress rings with round caps on a stone track; each arc grows in turn. */
export function Rings({
  rings,
  size = 132,
  stroke = 11,
  gap = 5,
  center,
  trackColor = color.stone100,
}: {
  rings: Ring[];
  size?: number;
  stroke?: number;
  gap?: number;
  center?: React.ReactNode;
  trackColor?: string;
}) {
  const outer = size / 2 - stroke / 2;
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size}>
        {rings.map((r, i) => {
          const rad = outer - i * (stroke + gap);
          return <Circle key={`t-${r.key}`} cx={size / 2} cy={size / 2} r={rad} stroke={trackColor} strokeWidth={stroke} fill="none" />;
        })}
        {rings.map((r, i) => (
          <RingArc key={r.key} cx={size / 2} r={outer - i * (stroke + gap)} stroke={stroke} value={r.value} color={r.color} delay={i * 120} />
        ))}
      </Svg>
      {center ? <View style={[StyleSheet.absoluteFill, styles.ringCenter]}>{center}</View> : null}
    </View>
  );
}

function RingArc({ cx, r, stroke, value, color: c, delay }: { cx: number; r: number; stroke: number; value: number; color: string; delay: number }) {
  const reduced = useReducedMotion();
  const len = 2 * Math.PI * r;
  const p = useSharedValue(reduced ? value : 0);
  useEffect(() => {
    p.value = reduced ? value : withDelay(200 + delay, withTiming(value, { duration: 800, easing: reveal }));
  }, [value, delay, reduced, p]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - Math.max(0.002, Math.min(1, p.value))) }));
  return (
    <AnimatedCircle
      cx={cx}
      cy={cx}
      r={r}
      stroke={c}
      strokeWidth={stroke}
      fill="none"
      strokeLinecap="round"
      strokeDasharray={`${len},${len}`}
      animatedProps={props}
      transform={`rotate(-90 ${cx} ${cx})`}
    />
  );
}

/* ---------------------------------------------------------------- legend bars */

/** Thin bar that fills from the left, used under legend rows. */
export function MeterBar({ value, barColor, delay = 0 }: { value: number; barColor: string; delay?: number }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? value : 0);
  useEffect(() => {
    p.value = reduced ? value : withDelay(250 + delay, withTiming(value, { duration: 700, easing: reveal }));
  }, [value, delay, reduced, p]);
  const fill = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, p.value)) * 100}%` }));
  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, { backgroundColor: barColor }, fill]} />
    </View>
  );
}

export function LegendDot({ c, dashed }: { c: string; dashed?: boolean }) {
  return <View style={[styles.legendDot, dashed ? { borderWidth: 1.5, borderColor: c, borderStyle: 'dashed' } : { backgroundColor: c }]} />;
}

const styles = StyleSheet.create({
  clip: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  axis: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 30, alignItems: 'center', marginTop: space[1] },
  axisLabel: { flex: 1, fontFamily: font.medium, fontSize: 12, lineHeight: 16 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    alignSelf: 'center',
    marginHorizontal: 'auto',
    paddingHorizontal: space[3],
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: color.stone100,
  },
  pillDark: { backgroundColor: 'rgba(244,241,230,0.12)' },
  pillLabel: { ...type.label, color: color.ink },
  pillItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pillValue: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16, color: color.ink },
  onDarkText: { color: color.onForest },
  dot: { width: 7, height: 7, borderRadius: 4 },
  ringCenter: { alignItems: 'center', justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, backgroundColor: color.stone100, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
});
