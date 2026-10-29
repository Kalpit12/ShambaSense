import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

// "Start here" on Home: the four things a new farmer does in their first week. Each step ticks
// itself off from what is on the phone; the card goes away when all four are done or the farmer
// hides it. Hidden is remembered per account on this phone.

export type StartStep = 'plot' | 'check' | 'record' | 'coop';
export const START_STEPS: StartStep[] = ['plot', 'check', 'record', 'coop'];

const keyOf = (owner: string) => `shambasense.start.v1.${owner}`;

export function useStartHidden(owner: string | undefined) {
  // Unknown until storage answers, so the card never flashes up for someone who hid it.
  const [hidden, setHidden] = useState<boolean | null>(null);
  useEffect(() => {
    if (!owner) return;
    AsyncStorage.getItem(keyOf(owner))
      .then((v) => setHidden(v === '1'))
      .catch(() => setHidden(false));
  }, [owner]);
  const hide = useCallback(() => {
    setHidden(true);
    if (owner) AsyncStorage.setItem(keyOf(owner), '1').catch(() => {});
  }, [owner]);
  return { hidden, hide };
}
