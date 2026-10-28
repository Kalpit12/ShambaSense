import type { Crop, Issue, IssueEvent, Outcome } from './types';

// Sample cases for one co-op, dated relative to now so the queue always looks current.
// Names and numbers are made up.

export const ORG = 'Njoro Growers Co-op';
export const ME = 'Wanjiru K.';
export const TEAM = ['Wanjiru K.', 'Otieno M.', 'Field officer · Chebet'];

const ago = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString();
const inDays = (days: number) => {
  const d = new Date(Date.now() + days * 86400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let n = 0;
const ev = (e: Omit<IssueEvent, 'id'>): IssueEvent => ({ id: `ev-${++n}`, ...e });

export function sampleIssues(): Issue[] {
  return [
    {
      id: 'i-0148', code: 'ISS-0148', title: 'Spots with rings on lower leaves',
      farmer: { name: 'Juma Kiprono', phone: '+254 712 345 678', language: 'sw', county: 'Nakuru', ward: 'Njoro' },
      farm: 'Shamba la Juma', plot: 'Tomatoes by the tank', crop: 'tomatoes', symptoms: ['Spots', 'Yellow leaves'],
      photos: ['early_blight', 'septoria'], severity: 'medium', status: 'open', assignee: null,
      createdAt: ago(3), updatedAt: ago(3), followUpDue: null,
      ai: { state: 'possible_match', causes: [{ id: 'early_blight', likelihood: 'possible' }, { id: 'septoria', likelihood: 'possible' }], library: 'tomato-2026.10' },
      events: [
        ev({ kind: 'created', actorKind: 'farmer', actor: 'Juma Kiprono', at: ago(3), body: 'Asked an agronomist from the result screen.' }),
        ev({ kind: 'ai_suggestion', actorKind: 'ai', actor: 'Library tomato-2026.10', at: ago(3) }),
      ],
    },
    {
      id: 'i-0147', code: 'ISS-0147', title: 'Plants wilting in the afternoon',
      farmer: { name: 'Grace Wambui', phone: '+254 722 118 904', language: 'sw', county: 'Nakuru', ward: 'Mauche' },
      farm: 'Wambui farm', plot: 'Main tomatoes', crop: 'tomatoes', symptoms: ['Wilting'],
      photos: ['wilt'], severity: 'high', status: 'open', assignee: null,
      createdAt: ago(5), updatedAt: ago(5), followUpDue: null,
      ai: { state: 'expert_review_required', causes: [], library: 'tomato-2026.10' },
      events: [
        ev({ kind: 'created', actorKind: 'system', actor: 'ShambaSense', at: ago(5), body: 'The library could not give an answer, so the check came here.' }),
        ev({ kind: 'ai_suggestion', actorKind: 'ai', actor: 'Library tomato-2026.10', at: ago(5) }),
      ],
    },
    {
      id: 'i-0146', code: 'ISS-0146', title: 'Holes in maize funnel, sawdust',
      farmer: { name: 'Juma Kiprono', phone: '+254 712 345 678', language: 'sw', county: 'Nakuru', ward: 'Njoro' },
      farm: 'Shamba la Juma', plot: 'Lower maize', crop: 'maize', symptoms: ['Holes or chewing', 'Insects seen'],
      photos: ['chewed'], severity: 'high', status: 'in_review', assignee: 'Wanjiru K.',
      createdAt: ago(26), updatedAt: ago(20), followUpDue: null,
      ai: { state: 'unsupported_crop', causes: [], library: 'tomato-2026.10' },
      events: [
        ev({ kind: 'created', actorKind: 'farmer', actor: 'Juma Kiprono', at: ago(26), body: 'Asked an agronomist: maize is not in the library yet.' }),
        ev({ kind: 'status_change', actorKind: 'agronomist', actor: 'Wanjiru K.', at: ago(20), status: 'in_review' }),
      ],
    },
    {
      id: 'i-0145', code: 'ISS-0145', title: 'Pale tunnels inside leaves',
      farmer: { name: 'Peter Mwangi', phone: '+254 701 552 310', language: 'en', county: 'Nakuru', ward: 'Lare' },
      farm: 'Mwangi greenhouse', plot: 'Greenhouse A', crop: 'tomatoes', symptoms: ['Holes or chewing'],
      photos: ['tuta'], severity: 'medium', status: 'open', assignee: 'Otieno M.',
      createdAt: ago(30), updatedAt: ago(30), followUpDue: null,
      ai: { state: 'possible_match', causes: [{ id: 'tuta', likelihood: 'more_likely' }], library: 'tomato-2026.10' },
      events: [
        ev({ kind: 'created', actorKind: 'farmer', actor: 'Peter Mwangi', at: ago(30), body: 'Asked an agronomist from the result screen.' }),
        ev({ kind: 'ai_suggestion', actorKind: 'ai', actor: 'Library tomato-2026.10', at: ago(30) }),
      ],
    },
    {
      id: 'i-0144', code: 'ISS-0144', title: 'Photo too dark to compare',
      farmer: { name: 'Faith Chepkoech', phone: '+254 733 870 441', language: 'sw', county: 'Nakuru', ward: 'Njoro' },
      farm: 'Chepkoech shamba', plot: 'Tomatoes', crop: 'tomatoes', symptoms: ['Something else'],
      photos: ['blurry'], severity: 'low', status: 'waiting_farmer', assignee: 'Wanjiru K.',
      createdAt: ago(52), updatedAt: ago(40), followUpDue: null,
      ai: { state: 'needs_more_information', causes: [], library: 'tomato-2026.10' },
      events: [
        ev({ kind: 'created', actorKind: 'farmer', actor: 'Faith Chepkoech', at: ago(52), body: 'Asked an agronomist from the result screen.' }),
        ev({ kind: 'ai_suggestion', actorKind: 'ai', actor: 'Library tomato-2026.10', at: ago(52) }),
        ev({ kind: 'request_photos', actorKind: 'agronomist', actor: 'Wanjiru K.', at: ago(40), body: 'Tafadhali piga picha nyingine mchana, karibu na jani moja lililoharibika.' }),
      ],
    },
    {
      id: 'i-0143', code: 'ISS-0143', title: 'Brown rust dots on bean leaves',
      farmer: { name: 'Samuel Kiptoo', phone: '+254 710 004 562', language: 'en', county: 'Nakuru', ward: 'Kihingo' },
      farm: 'Kiptoo farm', plot: 'Beans by the river', crop: 'beans', symptoms: ['Spots'],
      photos: ['rust'], severity: 'medium', status: 'action_given', assignee: 'Otieno M.',
      createdAt: ago(80), updatedAt: ago(70), followUpDue: inDays(-1),
      ai: { state: 'unsupported_crop', causes: [], library: 'tomato-2026.10' },
      events: [
        ev({ kind: 'created', actorKind: 'farmer', actor: 'Samuel Kiptoo', at: ago(80), body: 'Asked an agronomist: beans are not in the library yet.' }),
        ev({ kind: 'review_adjust', actorKind: 'agronomist', actor: 'Otieno M.', at: ago(70), causeIds: ['bean_rust'], body: 'This looks like bean rust. Remove the worst leaves, do not work in the beans while wet, and plant a rust-tolerant variety next season. Send a photo in 3 days.' }),
      ],
    },
    {
      id: 'i-0141', code: 'ISS-0141', title: 'Dark wet patches after rain',
      farmer: { name: 'Mary Njeri', phone: '+254 728 663 017', language: 'sw', county: 'Nakuru', ward: 'Mauche' },
      farm: 'Njeri farm', plot: 'Upper tomatoes', crop: 'tomatoes', symptoms: ['Spots', 'Rotting'],
      photos: ['late_blight'], severity: 'high', status: 'in_review', assignee: 'Wanjiru K.',
      createdAt: ago(150), updatedAt: ago(5), followUpDue: null,
      ai: { state: 'possible_match', causes: [{ id: 'late_blight', likelihood: 'possible' }, { id: 'early_blight', likelihood: 'possible' }], library: 'tomato-2026.10' },
      events: [
        ev({ kind: 'created', actorKind: 'farmer', actor: 'Mary Njeri', at: ago(150), body: 'Asked an agronomist from the result screen.' }),
        ev({ kind: 'ai_suggestion', actorKind: 'ai', actor: 'Library tomato-2026.10', at: ago(150) }),
        ev({ kind: 'review_agree', actorKind: 'agronomist', actor: 'Wanjiru K.', at: ago(140), causeIds: ['late_blight'], body: 'Hii ni ukungu wa nyanya. Ng’oa mimea iliyoathirika sana na uifukie mbali na shamba. Nitakupigia simu leo.' }),
        ev({ kind: 'follow_up_result', actorKind: 'farmer', actor: 'Mary Njeri', at: ago(76), outcome: 'same', photo: 'late_blight' }),
        ev({ kind: 'review_agree', actorKind: 'agronomist', actor: 'Wanjiru K.', at: ago(70), causeIds: ['late_blight'], body: 'Endelea kung’oa mimea iliyoathirika na usimwagilie majani. Tuma picha nyingine baada ya siku 3.' }),
        ev({ kind: 'follow_up_result', actorKind: 'farmer', actor: 'Mary Njeri', at: ago(5), outcome: 'better', photo: 'healthy' }),
      ],
    },
    {
      id: 'i-0139', code: 'ISS-0139', title: 'Yellow streaks on young maize',
      farmer: { name: 'John Ouma', phone: '+254 715 290 338', language: 'en', county: 'Nakuru', ward: 'Njoro' },
      farm: 'Ouma plot', plot: 'Maize near road', crop: 'maize', symptoms: ['Yellow leaves'],
      photos: ['streak'], severity: 'medium', status: 'closed', assignee: 'Otieno M.',
      createdAt: ago(260), updatedAt: ago(200), followUpDue: null,
      ai: { state: 'unsupported_crop', causes: [], library: 'tomato-2026.10' },
      events: [
        ev({ kind: 'created', actorKind: 'farmer', actor: 'John Ouma', at: ago(260), body: 'Asked an agronomist: maize is not in the library yet.' }),
        ev({ kind: 'review_adjust', actorKind: 'agronomist', actor: 'Otieno M.', at: ago(250), causeIds: ['maize_streak'], body: 'Maize streak virus, spread by leafhoppers. Pull out badly streaked young plants and keep the field edges weeded.' }),
        ev({ kind: 'status_change', actorKind: 'agronomist', actor: 'Otieno M.', at: ago(200), status: 'closed' }),
      ],
    },
    ...pastIssues(),
  ];
}

// Older, closed cases over the last three months, so Reports has history. Made from a fixed table,
// so the numbers are the same on every load.
const PAST: [Crop, string, string, string, number, number, string, Outcome | null][] = [
  // crop, cause, ward, agronomist, days ago, hours to first reply, title, follow-up outcome
  ['tomatoes', 'late_blight', 'Njoro', 'Wanjiru K.', 9, 3, 'Dark patches spreading on leaves', 'better'],
  ['maize', 'fall_armyworm', 'Lare', 'Otieno M.', 12, 5, 'Holes and frass in the funnel', 'better'],
  ['tomatoes', 'tuta', 'Mauche', 'Wanjiru K.', 14, 2, 'Leaves with tunnels', 'same'],
  ['beans', 'angular_leaf_spot', 'Kihingo', 'Chebet R.', 16, 20, 'Brown angular spots on bean leaves', null],
  ['kale', 'aphids', 'Njoro', 'Chebet R.', 18, 6, 'Curled leaves with small insects', 'better'],
  ['maize', 'fall_armyworm', 'Njoro', 'Otieno M.', 20, 4, 'Ragged maize leaves', 'better'],
  ['tomatoes', 'early_blight', 'Lare', 'Wanjiru K.', 23, 9, 'Ring spots on lower leaves', 'better'],
  ['potatoes', 'late_blight', 'Mauche', 'Otieno M.', 25, 30, 'Potato leaves going black', 'worse'],
  ['maize', 'nitrogen', 'Kihingo', 'Chebet R.', 28, 7, 'Pale yellow lower leaves', 'better'],
  ['tomatoes', 'bacterial_wilt', 'Njoro', 'Wanjiru K.', 31, 2, 'Plants wilting in the heat', 'worse'],
  ['beans', 'bean_rust', 'Lare', 'Otieno M.', 34, 11, 'Rusty spots under bean leaves', 'better'],
  ['cabbage', 'black_rot', 'Mauche', 'Chebet R.', 37, 16, 'V-shaped yellow patches on cabbage', 'same'],
  ['maize', 'maize_streak', 'Njoro', 'Otieno M.', 40, 5, 'Streaks on young maize', null],
  ['tomatoes', 'septoria', 'Kihingo', 'Wanjiru K.', 44, 4, 'Many small spots on leaves', 'better'],
  ['kale', 'water_stress', 'Lare', 'Chebet R.', 47, 26, 'Sukuma wilting at midday', 'better'],
  ['maize', 'fall_armyworm', 'Mauche', 'Otieno M.', 51, 3, 'Caterpillars in maize', 'better'],
  ['tomatoes', 'late_blight', 'Njoro', 'Wanjiru K.', 55, 6, 'Fruit and leaves rotting', 'same'],
  ['beans', 'aphids', 'Njoro', 'Chebet R.', 58, 8, 'Black insects on bean tips', 'better'],
  ['maize', 'mln', 'Kihingo', 'Otieno M.', 62, 14, 'Maize drying from the top', 'worse'],
  ['tomatoes', 'tuta', 'Lare', 'Wanjiru K.', 66, 3, 'Fruit with small holes', 'better'],
  ['potatoes', 'late_blight', 'Njoro', 'Otieno M.', 70, 10, 'Brown potato leaves after rain', 'better'],
  ['maize', 'nitrogen', 'Mauche', 'Chebet R.', 75, 22, 'Yellow V on maize leaves', null],
  ['tomatoes', 'early_blight', 'Mauche', 'Wanjiru K.', 80, 5, 'Target spots on old leaves', 'better'],
  ['beans', 'bean_rust', 'Kihingo', 'Otieno M.', 85, 9, 'Orange powder on bean leaves', 'same'],
];
const FARMERS: Record<string, [string, 'sw' | 'en']> = {
  Njoro: ['Faith Chepkoech', 'sw'],
  Lare: ['Peter Mwangi', 'en'],
  Mauche: ['Grace Wambui', 'sw'],
  Kihingo: ['Samuel Kiptoo', 'en'],
};

function pastIssues(): Issue[] {
  return PAST.map(([crop, cause, ward, by, days, replyH, title, outcome], k) => {
    const [name, language] = FARMERS[ward];
    const created = days * 24;
    const replied = created - replyH;
    const closed = replied - 24 * 6;
    const code = `ISS-${String(138 - k).padStart(4, '0')}`;
    const events: IssueEvent[] = [
      ev({ kind: 'created', actorKind: 'farmer', actor: name, at: ago(created), body: 'Asked an agronomist from the result screen.' }),
      ev({ kind: 'review_agree', actorKind: 'agronomist', actor: by, at: ago(replied), causeIds: [cause], body: 'See the steps in the reply. Send a follow-up photo in 5 days.' }),
      ...(outcome ? [ev({ kind: 'follow_up_result', actorKind: 'farmer', actor: name, at: ago(replied - 24 * 5), outcome, photo: 'healthy' as const })] : []),
      ev({ kind: 'status_change', actorKind: 'agronomist', actor: by, at: ago(closed), status: 'closed' }),
    ];
    return {
      id: `i-${code}`, code, title,
      farmer: { name, phone: '', language, county: 'Nakuru', ward },
      farm: `${name.split(' ')[1]} farm`, plot: 'Main plot', crop, symptoms: [], photos: ['healthy'],
      severity: replyH < 6 ? 'high' : 'medium', status: 'closed', assignee: by,
      createdAt: ago(created), updatedAt: ago(closed), followUpDue: null, ai: null, events,
    };
  });
}
