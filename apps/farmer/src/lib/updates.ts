import * as Updates from 'expo-updates';
import { AppState } from 'react-native';

import { reportError } from './errors';

// Over-the-air fixes (EAS Update, channel "preview"). The app looks for one each time it starts and
// downloads it in the background; it takes effect on the next start. Farmers rarely close the app,
// so it also looks again when they come back after a long break, and restarts straight away if a fix
// was downloaded: everything they entered is already saved on the phone, so nothing is lost.

const LONG_BREAK_MS = 30 * 60 * 1000;

export function installUpdateChecks() {
  if (!Updates.isEnabled) return;
  let leftAt = 0;
  AppState.addEventListener('change', async (state) => {
    if (state !== 'active') {
      leftAt = Date.now();
      return;
    }
    if (!leftAt || Date.now() - leftAt < LONG_BREAK_MS) return;
    leftAt = 0;
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) return;
      const fetched = await Updates.fetchUpdateAsync();
      if (fetched.isNew) await Updates.reloadAsync();
    } catch (e) {
      reportError(e, { kind: 'update' });
    }
  });
}
