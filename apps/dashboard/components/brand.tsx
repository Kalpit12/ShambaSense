import { WORDMARK_PATH } from './wordmark-path';

// Contour S bands. Never animate the bands or add effects (design.md §4.1).
const BANDS = [
  'M27.69 10.92A4.5 4.5 0 1 0 24 18A16.5 16.5 0 1 1 10.48 43.96',
  'M32.6 7.48A10.5 10.5 0 1 0 24 24A10.5 10.5 0 1 1 15.4 40.52',
  'M37.52 4.04A16.5 16.5 0 1 0 24 30A4.5 4.5 0 1 1 20.31 37.08',
];

/** Forest tile + ink wordmark, for the light nav. */
export function Lockup({ height = 28 }: { height?: number }) {
  return (
    <svg height={height} viewBox="0 0 324.72 48" role="img" aria-label="ShambaSense" style={{ display: 'block' }}>
      <rect width="48" height="48" rx="12.96" fill="var(--forest-900)" />
      <g transform="translate(24 24) scale(0.66) translate(-24 -24)" fill="none" stroke="var(--lime)" strokeWidth="4">
        {BANDS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <path transform="translate(62 34.5)" d={WORDMARK_PATH} fill="#0D110E" />
    </svg>
  );
}
