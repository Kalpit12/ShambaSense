import type { Photo } from '@/lib/types';

// Drawn leaves stand in for farmer photos in the sample data. Same drawings as the farmer app
// preview. Real cases show the photo from Storage through a short-lived signed URL.

const BG = '#24452A';
const LEAF = 'M50 6 C80 20 90 52 74 78 C66 90 56 95 50 96 C44 95 34 90 26 78 C10 52 20 20 50 6Z';
const SPOTS: [number, number, number][] = [[38, 62, 6.5], [60, 70, 5.5], [44, 80, 4.5], [64, 50, 4], [33, 44, 3.5], [56, 34, 3], [70, 64, 3.5]];
const SPECKS: [number, number][] = [[36, 40], [42, 52], [58, 46], [64, 58], [40, 68], [52, 76], [62, 72], [34, 56], [56, 60], [46, 36], [68, 42], [48, 88], [30, 70]];
const RUST: [number, number][] = [[34, 34], [40, 46], [58, 30], [62, 44], [46, 58], [36, 70], [56, 66], [66, 56], [50, 80], [44, 26], [60, 78], [30, 54], [70, 40], [52, 44]];

export function Leaf({ photo, label }: { photo: Photo; label?: string }) {
  const fill = photo === 'late_blight' ? '#5F7E3C' : photo === 'streak' ? '#86A84A' : photo === 'wilt' ? '#7C9446' : '#6E9E45';
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label={label ?? 'Sample photo drawing'} style={{ display: 'block', width: '100%', height: '100%' }}>
      <rect width="100" height="100" fill={BG} />
      <ellipse cx="18" cy="16" rx="18" ry="9" fill="#2E5530" opacity={0.7} transform="rotate(-30 18 16)" />
      <ellipse cx="88" cy="86" rx="16" ry="8" fill="#2A4E2C" opacity={0.7} transform="rotate(-35 88 86)" />
      <g transform={photo === 'wilt' ? 'rotate(28 50 20) translate(0 6) scale(1 0.92)' : 'rotate(-12 50 50)'} style={photo === 'blurry' ? { filter: 'blur(3px) brightness(0.45)' } : undefined}>
        <path d={LEAF} fill={fill} />
        <path d="M50 6 C80 20 90 52 74 78 C66 90 56 95 50 96 L50 6Z" fill="#000" opacity={0.08} />
        {photo === 'chewed' ? <path d="M74 78 C70 70 76 66 72 60 C78 58 80 52 84 50 L90 52 Z M26 78 C30 72 24 68 28 62 C22 60 18 52 14 50 L10 52 Z M46 30 a5 4 0 1 0 8 0 a5 4 0 1 0 -8 0" fill={BG} /> : null}
        <path d="M50 10 L50 94" stroke="#D9E8B8" strokeWidth={1.4} opacity={0.7} />
        {[24, 36, 48, 60, 72].map((y) => (
          <g key={y} opacity={0.45} stroke="#D9E8B8" strokeWidth={0.9} fill="none">
            <path d={`M50 ${y + 6} Q40 ${y + 2} 30 ${y - 4}`} />
            <path d={`M50 ${y + 6} Q60 ${y + 2} 70 ${y - 4}`} />
          </g>
        ))}
        {photo === 'early_blight' || photo === 'blurry'
          ? SPOTS.map(([x, y, r]) => (
              <g key={`${x}-${y}`}>
                <circle cx={x} cy={y} r={r + 2.2} fill="#D7C55A" opacity={0.55} />
                <circle cx={x} cy={y} r={r} fill="#5A3A1E" />
                <circle cx={x} cy={y} r={r * 0.66} fill="none" stroke="#2E1C0E" strokeWidth={0.9} />
                <circle cx={x} cy={y} r={r * 0.33} fill="none" stroke="#2E1C0E" strokeWidth={0.8} />
              </g>
            ))
          : null}
        {photo === 'late_blight' ? (
          <>
            <path d="M60 20 C76 30 82 50 74 70 C66 66 58 56 56 44 C54 34 56 26 60 20Z" fill="#3A3324" opacity={0.85} />
            <path d="M30 64 C38 60 46 66 46 76 C46 86 38 90 32 84 C28 78 26 70 30 64Z" fill="#3A3324" opacity={0.8} />
          </>
        ) : null}
        {photo === 'septoria'
          ? SPECKS.map(([x, y]) => (
              <g key={`${x}-${y}`}>
                <circle cx={x} cy={y} r={2.6} fill="#3B2A1A" />
                <circle cx={x} cy={y} r={1.3} fill="#CFC7B0" />
              </g>
            ))
          : null}
        {photo === 'rust' ? RUST.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.8} fill="#9A4E1C" stroke="#E2B169" strokeWidth={0.8} />) : null}
        {photo === 'streak'
          ? [36, 42, 48, 54, 60].map((x) => <path key={x} d={`M${x} 18 L${x + 2} 88`} stroke="#E9E39A" strokeWidth={1.6} strokeDasharray="6 3" opacity={0.9} />)
          : null}
        {photo === 'tuta' ? (
          <>
            <path d="M36 30 C44 34 40 44 48 48 C56 52 52 60 60 62" stroke="#E4E8C8" strokeWidth={6} strokeLinecap="round" fill="none" opacity={0.85} />
            <path d="M58 30 C64 34 62 40 66 44" stroke="#E4E8C8" strokeWidth={5} strokeLinecap="round" fill="none" opacity={0.8} />
            <path d="M34 70 C40 72 42 78 50 80" stroke="#E4E8C8" strokeWidth={5} strokeLinecap="round" fill="none" opacity={0.8} />
          </>
        ) : null}
      </g>
    </svg>
  );
}
