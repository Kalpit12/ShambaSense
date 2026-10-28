import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { color } from '@/theme/tokens';

// Background photos, bundled so the first screens cost no data. Cropped to 1080 x 1920 WebP,
// under 130 KB each. Sources and licences are listed in README.md.
export const FIELD_PHOTOS = [
  require('@/assets/images/slide-farmer.webp'),
  require('@/assets/images/slide-seedling.webp'),
  require('@/assets/images/slide-tea.webp'),
];

// Sign-in and sign-up headers: the tea rows read as texture in a short band, with no face to crop.
export const HEADER_PHOTO = FIELD_PHOTOS[2];

/**
 * Full-bleed farm photo under a forest tint, plus a static ink fade at the bottom so cream text
 * stays readable on any photo. Static, neutral ink only: no green gradient, no blur (design.md §2, §7).
 */
export function FieldBackground({ strength = 'strong' }: { strength?: 'strong' | 'soft' }) {
  return (
    <View style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image source={HEADER_PHOTO} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
      <FieldScrim strength={strength} />
    </View>
  );
}

export function FieldScrim({ strength = 'strong' }: { strength?: 'strong' | 'soft' }) {
  return (
    <>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: color.forest950, opacity: strength === 'strong' ? 0.5 : 0.35 }]} />
      {strength === 'strong' ? (
        <LinearGradient
          colors={['rgba(13,17,14,0)', 'rgba(13,17,14,0.55)', 'rgba(13,17,14,0.8)']}
          locations={[0, 0.45, 1]}
          style={styles.bottom}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '70%' },
});
