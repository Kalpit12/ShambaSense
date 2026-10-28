import type { SupabaseClient } from '@supabase/supabase-js';

import type { Org, Role } from './coop';

// Tasks and field visits (design.md §10). A farmer task shows on the farmer's phone and they tick it
// off; a visit is a team member going to a farm. Written only through the tasks_and_visits
// functions, which check the role and that the farmer is still in the co-op.

export type TaskKind = 'farmer' | 'visit';
export type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'done' | 'cancelled';

export type Task = {
  id: string;
  kind: TaskKind;
  farmerId: string;
  farmerName: string;
  phone: string;
  ward: string;
  plotId: string | null;
  plotName: string | null;
  issueId: string | null;
  issueCode: string | null;
  title: string;
  note: string | null;
  /** YYYY-MM-DD */
  dueOn: string;
  status: TaskStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  createdByName: string | null;
  doneAt: string | null;
  doneBy: 'farmer' | 'team' | null;
  outcome: string | null;
  createdAt: string;
  updatedAt: string;
};

export const KIND_WORD: Record<TaskKind, string> = { farmer: 'Farmer task', visit: 'Field visit' };
export const STATUS_WORD: Record<TaskStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
  cancelled: 'Cancelled',
};
export const isClosed = (s: TaskStatus) => s === 'done' || s === 'cancelled';
export const canPlan = (role: Role | undefined) => !!role && role !== 'viewer';

/** Plain words for the errors the task functions raise. */
export function taskError(message: string) {
  if (/farmer_not_linked/.test(message)) return 'This farmer is no longer in the co-op.';
  if (/title_required/.test(message)) return 'Say what the task is.';
  if (/due_required/.test(message)) return 'Pick a date.';
  if (/task_closed/.test(message)) return 'This task is closed. Reopen it to change it.';
  if (/only the co-op team/.test(message)) return 'Viewers cannot plan tasks.';
  if (/assignee/.test(message)) return 'That person is not on the team.';
  return message;
}

export type Draft = {
  kind: TaskKind;
  farmerId: string;
  plotId: string | null;
  issueId: string | null;
  title: string;
  note: string;
  dueOn: string;
  assigneeId: string | null;
};

export type Plot = { id: string; name: string };

export type TaskApi = {
  save: (id: string | null, d: Draft) => Promise<{ id?: string; error?: string }>;
  setStatus: (id: string, status: TaskStatus, outcome: string) => Promise<string | null>;
  plotsOf: (farmerId: string) => Promise<Plot[]>;
};

// Connected mode ------------------------------------------------------------------------------

export async function loadTasks(client: SupabaseClient, org: Org): Promise<Task[]> {
  const { data, error } = await client.rpc('org_tasks', { p_org: org.id });
  if (error) throw new Error(error.message);
  return (data ?? []).map((t: Record<string, string | null>) => ({
    id: t.id!,
    kind: t.kind as TaskKind,
    farmerId: t.farmer_id!,
    farmerName: t.farmer_name ?? 'Farmer',
    phone: t.phone ? `+${t.phone.replace(/^\+/, '')}` : '',
    ward: t.ward ?? '',
    plotId: t.plot_id,
    plotName: t.plot_name,
    issueId: t.issue_id,
    issueCode: t.issue_code,
    title: t.title!,
    note: t.note,
    dueOn: t.due_on!,
    status: t.status as TaskStatus,
    assigneeId: t.assignee_id,
    assigneeName: t.assignee_name,
    createdByName: t.created_by_name,
    doneAt: t.done_at,
    doneBy: t.done_by as Task['doneBy'],
    outcome: t.outcome,
    createdAt: t.created_at!,
    updatedAt: t.updated_at!,
  }));
}

export function remoteApi(client: SupabaseClient, org: Org): TaskApi {
  return {
    save: async (id, d) => {
      const { data, error } = await client.rpc('save_task', {
        p_id: id, p_org: org.id, p_kind: d.kind, p_farmer: d.farmerId, p_plot: d.plotId, p_issue: d.issueId,
        p_title: d.title, p_note: d.note, p_due: d.dueOn, p_assignee: d.assigneeId,
      });
      return { id: data as string, error: error ? taskError(error.message) : undefined };
    },
    setStatus: async (id, status, outcome) => {
      const { error } = await client.rpc('set_task_status', { p_id: id, p_status: status, p_outcome: outcome });
      return error ? taskError(error.message) : null;
    },
    plotsOf: async (farmerId) => {
      const { data } = await client.from('plots').select('id, name, farms!inner(owner_id)').eq('farms.owner_id', farmerId).order('name');
      return (data ?? []).map((p) => ({ id: p.id, name: p.name }));
    },
  };
}

// Sample data ---------------------------------------------------------------------------------

const day = (offset: number) => {
  const d = new Date(Date.now() + offset * 86400_000);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Africa/Nairobi' });
};
const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400_000).toISOString();

const SAMPLE_PLOTS: Record<string, Plot[]> = {
  'f-juma': [{ id: 'p-juma-1', name: 'Tomatoes by the tank' }, { id: 'p-juma-2', name: 'Lower maize' }, { id: 'p-juma-3', name: 'Beans by the road' }],
  'f-grace': [{ id: 'p-grace-1', name: 'Front tomatoes' }, { id: 'p-grace-2', name: 'Kitchen garden' }],
  'f-peter': [{ id: 'p-peter-1', name: 'Top field' }, { id: 'p-peter-2', name: 'Potatoes' }],
  'f-mary': [{ id: 'p-mary-1', name: 'Tomatoes' }, { id: 'p-mary-2', name: 'Sukuma' }],
};

const FARMERS: Record<string, [string, string, string]> = {
  'f-juma': ['Juma Kiprono', '+254 712 345 678', 'Njoro'],
  'f-grace': ['Grace Wambui', '+254 722 118 904', 'Mauche'],
  'f-peter': ['Peter Mwangi', '+254 701 552 310', 'Lare'],
  'f-faith': ['Faith Chepkoech', '+254 733 870 441', 'Njoro'],
  'f-samuel': ['Samuel Kiptoo', '+254 710 004 562', 'Kihingo'],
  'f-mary': ['Mary Njeri', '+254 728 663 017', 'Mauche'],
  'f-john': ['John Ouma', '+254 715 290 338', 'Njoro'],
  'f-esther': ['Esther Achieng', '+254 745 310 772', 'Lare'],
};
const TEAM: Record<string, string> = { 'u-akinyi': 'Akinyi Odhiambo', 'u-wanjiru': 'Wanjiru K.', 'u-otieno': 'Otieno M.', 'u-chebet': 'Chebet R.' };

type Seed = Pick<Task, 'id' | 'kind' | 'farmerId' | 'title'> & Partial<Task> & { due: number; who: string };
const t = (x: Seed): Task => {
  const [farmerName, phone, ward] = FARMERS[x.farmerId];
  const plot = x.plotId ? SAMPLE_PLOTS[x.farmerId]?.find((p) => p.id === x.plotId) : null;
  return {
    plotId: null, issueId: null, issueCode: null, note: null, status: 'open', doneAt: null, doneBy: null, outcome: null,
    createdByName: 'Wanjiru K.', createdAt: at(3), updatedAt: at(1),
    ...x,
    farmerName, phone, ward,
    plotName: plot?.name ?? null,
    dueOn: day(x.due),
    assigneeId: x.who,
    assigneeName: TEAM[x.who],
  };
};

export function sampleTasks(): Task[] {
  return [
    t({ id: 't-1', kind: 'farmer', farmerId: 'f-juma', plotId: 'p-juma-1', issueId: 'i-0148', issueCode: 'ISS-0148', title: 'Remove spotted lower leaves on the tomatoes', note: 'Carry them out of the field and burn or bury them. Then send a new photo.', due: 1, who: 'u-wanjiru' }),
    t({ id: 't-2', kind: 'visit', farmerId: 'f-grace', plotId: 'p-grace-1', issueId: 'i-0147', issueCode: 'ISS-0147', title: 'Check wilting tomatoes for bacterial wilt', note: 'Take a cut stem and a glass of water for the ooze test.', due: 0, who: 'u-chebet', status: 'in_progress' }),
    t({ id: 't-3', kind: 'visit', farmerId: 'f-juma', plotId: 'p-juma-2', title: 'Fall armyworm scouting in the lower maize', due: 3, who: 'u-wanjiru' }),
    t({ id: 't-4', kind: 'farmer', farmerId: 'f-peter', plotId: 'p-peter-1', issueId: 'i-0145', issueCode: 'ISS-0145', title: 'Hang the sticky traps from the co-op store', note: 'Two traps per row, at the height of the plants.', due: -2, who: 'u-otieno' }),
    t({ id: 't-5', kind: 'visit', farmerId: 'f-samuel', title: 'Soil sampling before planting', due: -1, who: 'u-chebet', status: 'blocked', outcome: 'Road to the farm flooded. Try again after the rains.' }),
    t({ id: 't-6', kind: 'farmer', farmerId: 'f-mary', plotId: 'p-mary-1', issueId: 'i-0141', issueCode: 'ISS-0141', title: 'Pull out plants with dark wet patches', note: 'Bury them away from the field. Do not compost them.', due: -1, who: 'u-wanjiru', status: 'done', doneAt: at(1.5), doneBy: 'farmer' }),
    t({ id: 't-7', kind: 'visit', farmerId: 'f-faith', title: 'Retake photos of the beans in daylight', due: -4, who: 'u-otieno', status: 'done', doneAt: at(4), doneBy: 'team', outcome: 'Angular leaf spot on about a third of the plants. Advised removing the worst leaves and rotating next season.' }),
    t({ id: 't-8', kind: 'farmer', farmerId: 'f-john', title: 'Record this week’s sukuma sales in the journal', due: 5, who: 'u-akinyi' }),
  ];
}

export function samplePlots(farmerId: string) {
  return SAMPLE_PLOTS[farmerId] ?? [];
}

export function sampleApi(set: (fn: (all: Task[]) => Task[]) => void, org: Org): TaskApi {
  const now = () => new Date().toISOString();
  return {
    save: async (id, d) => {
      const title = d.title.trim().replace(/\s+/g, ' ');
      if (!title) return { error: taskError('title_required') };
      if (!d.dueOn) return { error: taskError('due_required') };
      if (!FARMERS[d.farmerId]) return { error: 'Pick a farmer.' };
      const who = d.assigneeId ?? org.myId;
      const patch = {
        title, note: d.note.trim() || null, dueOn: d.dueOn, plotId: d.plotId, issueId: d.issueId,
        plotName: samplePlots(d.farmerId).find((p) => p.id === d.plotId)?.name ?? null,
        assigneeId: who, assigneeName: TEAM[who] ?? org.myName, updatedAt: now(),
      };
      if (id) {
        set((all) => all.map((x) => (x.id === id ? { ...x, ...patch } : x)));
        return { id };
      }
      const [farmerName, phone, ward] = FARMERS[d.farmerId];
      const fresh: Task = {
        ...patch, id: `t-${Date.now()}`, kind: d.kind, farmerId: d.farmerId, farmerName, phone, ward,
        issueCode: d.issueId ? `ISS-${d.issueId.replace(/\D/g, '')}` : null, status: 'open',
        createdByName: org.myName, doneAt: null, doneBy: null, outcome: null, createdAt: now(),
      };
      set((all) => [fresh, ...all]);
      return { id: fresh.id };
    },
    setStatus: async (id, status, outcome) => {
      set((all) =>
        all.map((x) =>
          x.id === id
            ? {
                ...x, status, outcome: outcome.trim() || x.outcome, updatedAt: now(),
                doneAt: status === 'done' ? (x.doneAt ?? now()) : null, doneBy: status === 'done' ? (x.doneBy ?? 'team') : null,
              }
            : x,
        ),
      );
      return null;
    },
    plotsOf: async (farmerId) => samplePlots(farmerId),
  };
}
