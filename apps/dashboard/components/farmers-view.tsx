'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { CROP_NAME } from '@/lib/causes';
import { coopError, isAdmin, loadFarmers, sampleFarmers, SIZE_LABEL, WATER_LABEL, type CoopFarmer } from '@/lib/coop';
import { ago, dateLabel } from '@/lib/format';
import { supabase } from '@/lib/remote';
import { useStore } from '@/lib/store';
import type { Crop, Issue } from '@/lib/types';
import { StatusTag } from './marks';

const cropName = (c: string) => CROP_NAME[c as Crop] ?? c;

/** Farmers: everyone who joined the co-op with its code, their farm, and their cases. */
export function FarmersView({ search, onOpenCase }: { search: string; onOpenCase: (id: string) => void }) {
  const { org, issues } = useStore();
  const [farmers, setFarmers] = useState<CoopFarmer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!org) return;
    if (!supabase) {
      setFarmers(sampleFarmers());
      setLoaded(true);
      return;
    }
    try {
      setFarmers(await loadFarmers(supabase, org));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load farmers');
    }
    setLoaded(true);
  }, [org]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelectedId(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Cases belong to a farmer by id when connected; sample cases carry only a name.
  const casesOf = useCallback((f: CoopFarmer) => issues.filter((i) => (i.farmerId ? i.farmerId === f.id : i.farmer.name === f.name)), [issues]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return farmers
      .map((f) => (supabase ? f : { ...f, openCases: casesOf(f).filter((i) => i.status !== 'closed').length }))
      .filter((f) => !q || [f.name, f.phone, f.ward, f.farmName].some((s) => s.toLowerCase().includes(q)));
  }, [farmers, search, casesOf]);

  const wards = new Set(farmers.map((f) => f.ward).filter(Boolean)).size;
  const active30 = farmers.filter((f) => f.lastCheckAt && Date.now() - new Date(f.lastCheckAt).getTime() < 30 * 86400_000).length;
  const selected = rows.find((f) => f.id === selectedId) ?? null;

  if (!org) return null;

  return (
    <div className={`issues ${selected ? 'with-detail' : ''}`}>
      <section className="list-pane" aria-label="Farmers">
        <div className="page-head">
          <h1>Farmers</h1>
          <p className="muted">Farmers who joined {org.name} with its join code. You see their farm and crop checks for as long as they stay in the co-op.</p>
        </div>
        {error ? <p className="flag">{error}</p> : null}
        {note ? <p className="sent">{note}</p> : null}

        <div className="widgets">
          <div className="widget">
            <span className="w-label">Farmers in the co-op</span>
            <span className="w-value num">{farmers.length}</span>
            <span className="w-sub">Across {wards} {wards === 1 ? 'ward' : 'wards'}</span>
          </div>
          <div className="widget">
            <span className="w-label">Sent a check in 30 days</span>
            <span className="w-value num">{active30}</span>
            <span className="w-sub">{farmers.length ? Math.round((active30 / farmers.length) * 100) : 0}% of farmers</span>
          </div>
          <div className="widget">
            <span className="w-label">Join code</span>
            <span className="w-value mono code-small">{org.joinCode}</span>
            <span className="w-sub">Share it at meetings or by SMS</span>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Farmer</th>
                <th className="c-crop">Crops</th>
                <th className="r">Checks</th>
                <th className="r">Open cases</th>
                <th className="c-updated">Last check</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr
                  key={f.id}
                  className={f.id === selectedId ? 'selected' : ''}
                  onClick={() => setSelectedId(f.id)}
                  tabIndex={0}
                  aria-selected={f.id === selectedId}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSelectedId(f.id))}>
                  <td>
                    <div className="row-title">{f.name}</div>
                    <div className="row-sub">{[f.farmName, [f.ward, f.county].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="c-crop">{f.crops.map(cropName).join(', ') || <span className="muted">Not set</span>}</td>
                  <td className="r num">{f.checks}</td>
                  <td className="r num">{f.openCases ? <strong>{f.openCases}</strong> : <span className="muted">0</span>}</td>
                  <td className="c-updated meta num">{f.lastCheckAt ? ago(f.lastCheckAt) : 'None yet'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {loaded && rows.length === 0 ? (
            <p className="empty">{search ? 'No farmer matches that search.' : `No farmers yet. Share the join code ${org.joinCode} so farmers can join from the app.`}</p>
          ) : null}
        </div>
      </section>

      {selected ? (
        <>
          <div className="detail-scrim" onClick={() => setSelectedId(null)} />
          <FarmerDetail
            key={selected.id}
            farmer={selected}
            cases={casesOf(selected)}
            canRemove={isAdmin(org.role)}
            onClose={() => setSelectedId(null)}
            onOpenCase={onOpenCase}
            onRemove={async () => {
              if (!confirm(`Remove ${selected.name} from ${org.name}? The co-op stops seeing their farm and checks at once. Their own records stay on their phone.`)) return;
              setError(null);
              if (supabase) {
                const { error: e } = await supabase.rpc('remove_farmer', { p_org: org.id, p_farmer: selected.id });
                if (e) return setError(coopError(e.message));
                await load();
              } else setFarmers((all) => all.filter((x) => x.id !== selected.id));
              setSelectedId(null);
              setNote(`${selected.name} was removed from the co-op.`);
            }}
          />
        </>
      ) : null}
    </div>
  );
}

function FarmerDetail({
  farmer: f,
  cases,
  canRemove,
  onClose,
  onOpenCase,
  onRemove,
}: {
  farmer: CoopFarmer;
  cases: Issue[];
  canRemove: boolean;
  onClose: () => void;
  onOpenCase: (id: string) => void;
  onRemove: () => void;
}) {
  return (
    <aside className="detail" aria-label={f.name}>
      <div className="detail-head">
        <span className="meta muted">Farmer</span>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
            <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <h2>{f.name}</h2>
      <p className="muted">
        {[f.phone, [f.ward, f.county].filter(Boolean).join(', ')].filter(Boolean).join(' · ')} · reads {f.language === 'sw' ? 'Kiswahili' : 'English'}
      </p>
      <p className="muted">Joined {dateLabel(f.joinedAt)}</p>

      <section className="block">
        <h3>{f.farmName || 'Farm'}</h3>
        <dl className="kv">
          <dt>Size</dt>
          <dd>{f.sizeBand ? SIZE_LABEL[f.sizeBand] ?? f.sizeBand : 'Not set'}</dd>
          <dt>Water</dt>
          <dd>{f.waterSource ? WATER_LABEL[f.waterSource] ?? f.waterSource : 'Not set'}</dd>
          <dt>Plots</dt>
          <dd className="num">{f.plots}</dd>
          <dt>Main crops</dt>
          <dd>{f.crops.length ? f.crops.map(cropName).join(', ') : 'Not set'}</dd>
          <dt>Checks sent</dt>
          <dd className="num">
            {f.checks}
            {f.lastCheckAt ? <span className="muted"> · last {ago(f.lastCheckAt)}</span> : null}
          </dd>
        </dl>
      </section>

      <section className="block">
        <h3>Cases</h3>
        {cases.length ? (
          <ul className="case-list">
            {cases.map((i) => (
              <li key={i.id}>
                <button onClick={() => onOpenCase(i.id)}>
                  <span>
                    <span className="mono muted">{i.code}</span> {i.title}
                    <span className="row-sub">
                      {i.plot} · {CROP_NAME[i.crop]} · {ago(i.updatedAt)}
                    </span>
                  </span>
                  <StatusTag status={i.status} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No cases. Checks the library answered on the phone do not open a case.</p>
        )}
      </section>

      {canRemove ? (
        <div className="status-actions">
          <button className="btn btn-secondary" onClick={onRemove}>
            Remove from co-op
          </button>
        </div>
      ) : null}
    </aside>
  );
}
