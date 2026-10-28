// Reads the photo of a crop check and writes a check_results row (architecture.md §6.3). The model
// may only pick from the reviewed cause list for the crop, or say it is not sure; the result has no
// field for a product, dose or mix (§6.4). The phone calls this once the photo is uploaded; an
// agronomist still reviews every check during the pilot.
//
// Secrets (Supabase → Edge Functions → Secrets): OPENAI_API_KEY, and optionally OPENAI_MODEL and
// DAILY_CHECKS_PER_FARMER. SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are set by
// Supabase itself.

import OpenAI from 'npm:openai@7.45.1';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const MODEL = Deno.env.get('OPENAI_MODEL') || 'gpt-5.4-mini';
const DAILY_LIMIT = Number(Deno.env.get('DAILY_CHECKS_PER_FARMER') || 20);
const LIBRARY = 'library-2026.10';

// The reviewed library: the causes the farmer app has names, signs and steps for. Signs match the
// app's English text so the model and the result screen describe the same thing. Keep in step with
// CAUSES in apps/farmer/src/lib/check-results.ts.
const APHIDS = 'Aphids (pest): groups of small green or black insects under the leaves and on new shoots; curled, sticky leaves; ants walking up and down the plants.';
const LIBRARY_CAUSES: Record<string, Record<string, string>> = {
  tomatoes: {
    early_blight: 'Early blight (Alternaria solani): brown spots on the older, lower leaves; rings inside the spots like a target; a yellow edge around some spots.',
    late_blight: 'Late blight (Phytophthora infestans): large dark patches that look wet; spreads fast in cool, wet weather; firm brown patches on the fruit; may show white mould under leaves.',
    septoria: 'Septoria leaf spot (Septoria lycopersici): many small round spots with a dark edge; a grey or pale centre in each spot; starts on the lowest leaves.',
    tuta: 'Tomato leaf miner, Tuta absoluta (pest): pale, see-through blotches (mines) inside the leaf; small dark droppings inside the mines; small holes in the fruit.',
  },
  maize: {
    fall_armyworm: 'Fall armyworm, Spodoptera frugiperda (pest): ragged holes and see-through windows in young leaves; wet sawdust-like droppings in the leaf funnel; caterpillar with a pale upside-down Y on its head.',
    maize_streak: 'Maize streak virus: thin pale yellow streaks running along the leaf, often broken like dashes; streaks join up on the newest leaves; young plants stay short.',
    mln: 'Maize lethal necrosis (MCMV + SCMV): yellow mottling starting at the leaf edges; leaves dry from the edges inward and the top leaves die ("dead heart"); small cobs with few grains.',
    nitrogen: 'Nitrogen shortage: yellowing that starts at the tip of the older, lower leaves and runs along the midrib in a V; pale, thin plants; newer leaves stay greener.',
  },
  beans: {
    bean_rust: 'Bean rust (Uromyces appendiculatus): small rusty-brown raised pustules, mostly under the leaves, often with a yellow halo; brown powder rubs off; leaves yellow and drop early.',
    angular_leaf_spot: 'Angular leaf spot (Pseudocercospora griseola): grey or brown spots with straight edges boxed in by the veins; spots join and the leaf yellows; dark round spots with red-brown edges on pods.',
    aphids: APHIDS,
  },
  kale: {
    black_rot: 'Black rot (Xanthomonas campestris): yellow V-shaped patches starting at the leaf edge, pointing inward; black veins inside the yellow patches; lower leaves wilt and fall.',
    aphids: APHIDS,
  },
};

const STATES = ['possible_match', 'needs_more_information', 'expert_review_required'] as const;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const auth = req.headers.get('Authorization') ?? '';
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: who } = await asCaller.auth.getUser();
  const userId = who.user?.id;
  if (!userId) return reply(401, { error: 'Sign in first.' });

  let checkId = '';
  try {
    checkId = String((await req.json()).check_id ?? '');
  } catch {
    // handled below
  }
  if (!/^[0-9a-f-]{36}$/i.test(checkId)) return reply(400, { error: 'check_id is missing.' });

  // Only the farmer who sent the check can ask for its result.
  const { data: check } = await admin
    .from('crop_checks')
    .select('id, crop_claimed, symptoms, kind, created_by')
    .eq('id', checkId)
    .maybeSingle();
  if (!check || check.created_by !== userId) return reply(404, { error: 'Check not found.' });
  if (check.kind !== 'initial') return reply(400, { error: 'Follow-up photos go to the agronomist.' });

  const { data: existing } = await admin.from('check_results').select('state').eq('check_id', checkId).maybeSingle();
  if (existing) return reply(200, { state: existing.state, already: true });

  const causes = LIBRARY_CAUSES[check.crop_claimed];
  if (!causes) return save(admin, checkId, 'library', { state: 'unsupported_crop', causes: [], observed: [] }, null);

  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) return reply(503, { error: 'Photo reading is not set up yet.' });

  // A cap per farmer per day keeps the bill predictable. Over it, the check still goes to the agronomist.
  const since = new Date(Date.now() - 86400_000).toISOString();
  const { count } = await admin
    .from('check_results')
    .select('id, crop_checks!inner(created_by)', { count: 'exact', head: true })
    .eq('crop_checks.created_by', userId)
    .like('model_version', 'openai:%')
    .gte('created_at', since);
  if ((count ?? 0) >= DAILY_LIMIT) return reply(429, { error: 'Daily photo limit reached.' });

  const { data: media } = await admin.from('media').select('storage_path').eq('check_id', checkId).eq('kind', 'photo').maybeSingle();
  if (!media) return reply(409, { error: 'The photo has not arrived yet.' });
  const { data: photo, error: photoError } = await admin.storage.from('check-photos').download(media.storage_path);
  if (photoError || !photo) return reply(409, { error: 'The photo has not arrived yet.' });
  const image = `data:${photo.type || 'image/jpeg'};base64,${toBase64(new Uint8Array(await photo.arrayBuffer()))}`;

  const ids = Object.keys(causes);
  const openai = new OpenAI({ apiKey: key });
  let answer: Answer;
  let raw: unknown;
  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      reasoning_effort: 'low',
      max_completion_tokens: 2000,
      response_format: { type: 'json_schema', json_schema: { name: 'crop_check', strict: true, schema: schemaFor(ids) } },
      messages: [
        { role: 'system', content: instructions(check.crop_claimed, causes) },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Crop the farmer chose: ${check.crop_claimed}. Signs the farmer ticked: ${(check.symptoms ?? []).join(', ') || 'none'}.` },
            { type: 'image_url', image_url: { url: image, detail: 'high' } },
          ],
        },
      ],
    });
    raw = completion;
    const text = completion.choices[0]?.message?.content;
    if (!text) throw new Error(completion.choices[0]?.message?.refusal ?? 'empty answer');
    answer = JSON.parse(text) as Answer;
  } catch (e) {
    console.error('openai', e instanceof Error ? e.message : e);
    return reply(502, { error: 'Could not read the photo right now.' });
  }

  return save(admin, checkId, `openai:${MODEL}`, clean(answer, ids), raw);
});

type Answer = {
  state: (typeof STATES)[number];
  causes: { cause_id: string; likelihood: 'more_likely' | 'possible' }[];
  observed: string[];
  reason: string;
};

function instructions(crop: string, causes: Record<string, string>) {
  return [
    `You help smallholder farmers in Kenya by looking at one photo of their ${crop} plant.`,
    'You may only name causes from this reviewed list. Never name a cause outside it.',
    ...Object.entries(causes).map(([id, text]) => `- ${id}: ${text}`),
    '',
    'Choose the state:',
    '- possible_match: the photo clearly shows the signs of one or two causes on the list. Use likelihood "more_likely" only for one cause that fits much better than the rest; otherwise "possible". List the best fit first. At most two causes.',
    '- needs_more_information: the photo is blurry, too dark, too far away, not this crop, shows a healthy plant, or the signs do not clearly match any cause on the list. Give no causes.',
    `- expert_review_required: the plant shows serious damage that is not on the list (for example the whole plant wilting while leaves stay green, mosaic or curled leaves from a virus, or rotting stems), or it could spread fast and you cannot tell which cause it is. Give no causes.`,
    'Be careful: a wrong cause sends the farmer the wrong advice. When unsure, prefer needs_more_information.',
    'The signs the farmer ticked are hints only. Trust the photo.',
    'observed: up to three short plain phrases describing what is visible in the photo, in English.',
    'reason: one short sentence for the agronomist on why you chose this state.',
    'Never mention products, chemicals, doses or mixes.',
  ].join('\n');
}

function schemaFor(ids: string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['state', 'causes', 'observed', 'reason'],
    properties: {
      state: { type: 'string', enum: [...STATES] },
      causes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['cause_id', 'likelihood'],
          properties: { cause_id: { type: 'string', enum: ids }, likelihood: { type: 'string', enum: ['more_likely', 'possible'] } },
        },
      },
      observed: { type: 'array', items: { type: 'string' } },
      reason: { type: 'string' },
    },
  };
}

/** Holds the answer to the rules even if the model strays: known causes only, at most two, none without a match. */
function clean(a: Answer, ids: string[]) {
  const state = STATES.includes(a.state) ? a.state : 'needs_more_information';
  const seen = new Set<string>();
  let causes = (a.causes ?? []).filter((c) => ids.includes(c.cause_id) && !seen.has(c.cause_id) && seen.add(c.cause_id)).slice(0, 2);
  if (state !== 'possible_match') causes = [];
  if (causes.length > 1) causes = causes.map((c, i) => ({ ...c, likelihood: i === 0 ? c.likelihood : 'possible' }));
  return {
    state: state === 'possible_match' && causes.length === 0 ? 'needs_more_information' : state,
    causes,
    observed: (a.observed ?? []).slice(0, 3).map((s) => String(s).slice(0, 120)),
    reason: String(a.reason ?? '').slice(0, 300),
  };
}

// deno-lint-ignore no-explicit-any
async function save(admin: any, checkId: string, version: string, r: { state: string; causes: unknown[]; observed: string[]; reason?: string }, raw: unknown) {
  const { error } = await admin.from('check_results').insert({
    check_id: checkId,
    model_version: version === 'library' ? LIBRARY : version,
    state: r.state,
    causes: r.causes,
    observed: r.observed,
    raw: raw ? { reason: r.reason, response: raw } : null,
  });
  // Two calls at once: the first one wins, which is fine.
  if (error && !/duplicate|unique/i.test(error.message)) return reply(500, { error: 'Could not save the result.' });
  await admin.from('crop_checks').update({ status: 'done' }).eq('id', checkId);
  return reply(200, { state: r.state });
}

function toBase64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
