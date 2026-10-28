import { CROP_NAME } from './causes';
import { SIZE_LABEL, WATER_LABEL, type CoopFarmer } from './coop';
import { download, toCsv } from './reports';
import { causeName, type Round } from './scouting';
import { KIND_WORD, STATUS_WORD, type Task } from './tasks';

// CSV downloads for the Farmers, Tasks and Scouting pages, in the same format as Reports, so a co-op
// can keep its own copy of the pilot's data or open it in Excel.

const stamp = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Nairobi' });
const slug = (org: string) => org.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shambasense';
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleString('sv-SE', { timeZone: 'Africa/Nairobi' }).slice(0, 16) : '');

export function downloadFarmers(org: string, rows: CoopFarmer[]) {
  download(
    `${slug(org)}-farmers-${stamp()}.csv`,
    toCsv(
      ['Name', 'Phone', 'Language', 'County', 'Ward', 'Farm', 'Size', 'Water', 'Crops', 'Plots', 'Checks', 'Open cases', 'Last check', 'Joined'],
      rows.map((f) => [
        f.name, f.phone, f.language === 'en' ? 'English' : 'Kiswahili', f.county, f.ward, f.farmName,
        f.sizeBand ? (SIZE_LABEL[f.sizeBand] ?? f.sizeBand) : '', f.waterSource ? (WATER_LABEL[f.waterSource] ?? f.waterSource) : '', f.crops.join('; '),
        f.plots, f.checks, f.openCases, time(f.lastCheckAt), time(f.joinedAt),
      ]),
    ),
  );
}

export function downloadTasks(org: string, rows: Task[]) {
  download(
    `${slug(org)}-tasks-${stamp()}.csv`,
    toCsv(
      ['Kind', 'Title', 'Farmer', 'Phone', 'Ward', 'Plot', 'Case', 'Due', 'Status', 'Who', 'Done', 'Done by', 'Outcome', 'Note'],
      rows.map((t) => [
        KIND_WORD[t.kind], t.title, t.farmerName, t.phone, t.ward, t.plotName ?? '', t.issueCode ?? '', t.dueOn,
        STATUS_WORD[t.status], t.assigneeName ?? '', time(t.doneAt), t.doneBy ?? '', t.outcome ?? '', t.note ?? '',
      ]),
    ),
  );
}

/** One line per finding, so counts add up in a spreadsheet; a healthy round is one line with no cause. */
export function downloadScouting(org: string, rows: Round[]) {
  download(
    `${slug(org)}-scouting-${stamp()}.csv`,
    toCsv(
      ['Date', 'Farmer', 'Ward', 'Plot', 'Crop', 'Plants checked', 'Problem', 'Plants affected', 'Share', 'Severity', 'Scout', 'Note'],
      rows.flatMap((r) => {
        const base = [r.observedOn, r.farmerName, r.ward, r.plotName ?? '', CROP_NAME[r.crop] ?? r.crop, r.checked];
        const tail = [r.scoutName ?? '', r.note ?? ''];
        if (!r.findings.length) return [[...base, 'None found', 0, '0%', '', ...tail]];
        return r.findings.map((f) => [...base, causeName(f.causeId), f.affected, `${Math.round((f.affected / r.checked) * 100)}%`, f.severity, ...tail]);
      }),
    ),
  );
}
