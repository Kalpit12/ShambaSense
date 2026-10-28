'use client';

import { useEffect, useState } from 'react';

import { causesFor, CROP_NAME } from '@/lib/causes';
import { ALL_CROPS, coopError, isAdmin, KIND_LABEL, type OrgKind } from '@/lib/coop';
import { COUNTIES } from '@/lib/counties';
import { supabase } from '@/lib/remote';
import { useStore } from '@/lib/store';
import type { Crop } from '@/lib/types';

const KINDS = Object.keys(KIND_LABEL) as OrgKind[];

/** "+254712345678" → "0712 345 678", the way people in Kenya write it. */
const localPhone = (p: string | null) => (p ? `0${p.slice(4, 7)} ${p.slice(7, 10)} ${p.slice(10)}` : '');

/** The same tidying the database does, so sample mode stores what connected mode would. */
function toE164(input: string): string | null | false {
  const d = input.replace(/\D/g, '');
  if (!d) return null;
  if (/^0[17]\d{8}$/.test(d)) return `+254${d.slice(1)}`;
  if (/^254[17]\d{8}$/.test(d)) return `+${d}`;
  if (/^[17]\d{8}$/.test(d)) return `+254${d}`;
  return false;
}

/** Settings (design.md §10): the co-op's details and crops for admins, and each member's own name. */
export function SettingsView() {
  const { org, patchOrg } = useStore();
  const admin = isAdmin(org?.role);
  const [name, setName] = useState(org?.name ?? '');
  const [kind, setKind] = useState<OrgKind>(org?.kind ?? 'coop');
  const [county, setCounty] = useState(org?.county ?? '');
  const [phone, setPhone] = useState(localPhone(org?.contactPhone ?? null));
  const [crops, setCrops] = useState<Crop[]>(org?.crops ?? ALL_CROPS);
  const [myName, setMyName] = useState(org?.myName ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!org) return;
    setName(org.name);
    setKind(org.kind);
    setCounty(org.county ?? '');
    setPhone(localPhone(org.contactPhone));
    setCrops(org.crops);
    setMyName(org.myName);
  }, [org]);

  if (!org) return null;
  const say = (ok: string | null, bad: string | null) => {
    setNote(ok);
    setError(bad);
  };

  const saveDetails = async () => {
    const tidy = toE164(phone);
    if (tidy === false) return say(null, coopError('bad_phone'));
    if (name.trim().length < 2) return say(null, coopError('name_length'));
    if (crops.length === 0) return say(null, coopError('no_crops'));
    setBusy(true);
    if (supabase) {
      const { error: e } = await supabase.rpc('update_org_settings', {
        p_org: org.id,
        p_name: name,
        p_kind: kind,
        p_county: county || null,
        p_contact_phone: phone,
        p_crops: crops,
      });
      setBusy(false);
      if (e) return say(null, coopError(e.message));
    } else setBusy(false);
    const ordered = ALL_CROPS.filter((c) => crops.includes(c));
    patchOrg({ name: name.trim(), kind, county: county || null, contactPhone: tidy, crops: ordered });
    say('Co-op details saved.', null);
  };

  const saveMyName = async () => {
    if (myName.trim().length < 2) return say(null, coopError('name_length'));
    if (supabase) {
      const { error: e } = await supabase.rpc('set_my_display_name', { p_org: org.id, p_name: myName });
      if (e) return say(null, coopError(e.message));
    }
    patchOrg({ myName: myName.trim() });
    say('Your name is saved. Farmers see it on your next reply.', null);
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Settings</h1>
        <p className="muted">How {org.name} shows up for farmers, and which crops this dashboard covers. The join code and the team are on the Team page.</p>
      </div>
      {error ? <p className="flag">{error}</p> : null}
      {note ? <p className="sent">{note}</p> : null}

      <div className="two two-top">
        <section className="panel">
          <h2>Co-op details</h2>
          <form
            className="invite"
            onSubmit={(e) => {
              e.preventDefault();
              saveDetails();
            }}>
            <fieldset className="plain" disabled={!admin || busy}>
              <label className="field">
                <span className="field-label">Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
              </label>
              <label className="field">
                <span className="field-label">Type</span>
                <select value={kind} onChange={(e) => setKind(e.target.value as OrgKind)}>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Home county</span>
                <select value={county} onChange={(e) => setCounty(e.target.value)}>
                  <option value="">Not set</option>
                  {COUNTIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Phone for farmers</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="0712 345 678" autoComplete="off" />
                <span className="muted small">Shown in the farmer app under Profile, so farmers can call the co-op. Leave empty to hide it.</span>
              </label>
              <div className="field">
                <span className="field-label">Crops you work with</span>
                <div className="crop-picks">
                  {ALL_CROPS.map((c) => (
                    <label key={c} className="crop-pick">
                      <input
                        type="checkbox"
                        checked={crops.includes(c)}
                        onChange={(e) => setCrops((all) => (e.target.checked ? [...all, c] : all.filter((x) => x !== c)))}
                      />
                      <span>
                        {CROP_NAME[c]} <span className="muted small">· {causesFor(c).length} problems</span>
                      </span>
                    </label>
                  ))}
                </div>
                <span className="muted small">Scouting and new guides offer only these crops. Farmers can still send photo checks of any crop the app knows.</span>
              </div>
              {admin ? (
                <button className="btn btn-primary" disabled={busy}>
                  Save details
                </button>
              ) : (
                <p className="muted">Only an owner or admin can change these.</p>
              )}
            </fieldset>
          </form>
        </section>

        <section className="panel">
          <h2>Your name</h2>
          <form
            className="invite"
            onSubmit={(e) => {
              e.preventDefault();
              saveMyName();
            }}>
            <label className="field">
              <span className="field-label">Name farmers see</span>
              <input value={myName} onChange={(e) => setMyName(e.target.value)} maxLength={60} required />
              <span className="muted small">Shown on your replies and farm visits, e.g. &ldquo;Wanjiru K.&rdquo;</span>
            </label>
            <button className="btn btn-secondary" disabled={myName.trim() === org.myName}>
              Save name
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
