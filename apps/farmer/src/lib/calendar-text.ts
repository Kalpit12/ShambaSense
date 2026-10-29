import type { TFunction } from 'i18next';

import type { PlotStep } from './calendar';

/** Title and advice for a calendar step, in the app's language. */
export function stepText(t: TFunction, s: PlotStep) {
  const pests = (s.pests ?? []).map((id) => t(`causes.${id}.name`)).join(', ');
  return {
    title: t(`calendar.steps.${s.kind}.title`, { plot: s.plot.name }),
    hint: t(`calendar.steps.${s.kind}.hint`, { pests }),
  };
}
