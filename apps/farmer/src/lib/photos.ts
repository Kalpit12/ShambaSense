import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

// Crop check photos live in the app's own folder until they upload, so clearing the camera cache
// or the gallery never loses a check that is still waiting (architecture.md §7).
const dir = () => new Directory(Paths.document, 'checks');

export function keepPhoto(uri: string, id: string): string {
  if (Platform.OS === 'web') return uri;
  try {
    const target = dir();
    if (!target.exists) target.create({ intermediates: true, idempotent: true });
    const dest = new File(target, `${id}.jpg`);
    new File(uri).copy(dest);
    return dest.uri;
  } catch {
    return uri;
  }
}

/** Sign-out removes photos that are still on this phone (design.md §7.10). */
export function deletePhotos() {
  if (Platform.OS === 'web') return;
  try {
    const target = dir();
    if (target.exists) target.delete();
  } catch {
    // Nothing to remove.
  }
}
