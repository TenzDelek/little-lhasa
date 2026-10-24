// Top of the screen: area name + day/night glyph (left), errand tracker under it, purse chips (right).
import { useEffect, useState } from 'react';
import { useGame, G } from '../game/store';
import { QUESTS, type QuestDef } from '../game/quests';
import type { QuestState } from '../game/store';
import { COIN, ITEM_DEFS } from './pixels';
import { DayGlyph, KeyCap, Pips, PixelIcon } from './bits';
import { errandCount, setTrackerFolded, useMedia, useUi } from './ctl';

const AREA_BOD: Record<string, string> = {
  'Tsuglagkhang': 'གཙུག་ལག་ཁང་།',
  'Tsuglagkhang Courtyard': 'གཙུག་ལག་ཁང་།',
  'Lingkhor Kora': 'གླིང་སྐོར།',
};

export function AreaBlock() {
  const area = useGame((s) => s.area);
  const night = useGame((s) => s.night);
  const bod = AREA_BOD[area];
  return (
    <div className="area chip" role="status" aria-live="polite">
      <p className="eyebrow area-eyebrow"><DayGlyph night={night} />McLeod Ganj · {night ? 'Night' : 'Day'}</p>
      <p className="area-name" key={area}>
        <span className="latin">{area}</span>
        {bod && <span className="bod" lang="bo">{bod}</span>}
      </p>
    </div>
  );
}

const fresh = (id: string): QuestState => ({ id, stage: 0, done: false, count: 0, seen: [] });
const sig = (q: QuestState) => `${q.stage}|${q.count}|${q.done}`;

/** Which errand changed last, so its line can glow for a moment (watches the store directly). */
function useChangedErrand() {
  const [hot, setHot] = useState<string | null>(null);
  useEffect(() => {
    let t = 0;
    const unsub = useGame.subscribe((s, p) => {
      if (s.quests === p.quests) return;
      const id = QUESTS.find((d) => sig(s.quests[d.id] ?? fresh(d.id)) !== sig(p.quests[d.id] ?? fresh(d.id)))?.id;
      if (!id) return;
      setHot(id);
      clearTimeout(t);
      t = window.setTimeout(() => setHot(null), 2200);
    });
    return () => { unsub(); clearTimeout(t); };
  }, []);
  return hot;
}

export function ErrandLine({ def, q, hot, full }: { def: QuestDef; q: QuestState; hot?: boolean; full?: boolean }) {
  const state = q.done ? 'done' : q.stage > 0 ? 'active' : 'idle';
  return (
    <li className={`errand is-${state}${hot ? ' is-hot' : ''}`}>
      <span className="errand-box" aria-hidden="true">{q.done ? '✓' : ''}</span>
      <span className="errand-body">
        <span className="errand-title">
          {def.title}
          {full && def.bod && <span className="bod" lang="bo">{def.bod}</span>}
          {def.target && !q.done && <Pips n={q.count} total={def.target} label={`${Math.min(q.count, def.target)} of ${def.target}`} />}
        </span>
        {(!q.done || full) && (
          <span className="errand-obj">{q.done ? 'Done.' : def.objective(q.stage, q.count)}</span>
        )}
      </span>
      <span className="sr-only">{q.done ? ' (done)' : ''}</span>
    </li>
  );
}

export function Tracker() {
  const quests = useGame((s) => s.quests);
  const folded = useUi((s) => s.trackerFolded);
  const compact = useMedia('(max-width: 860px), (max-height: 520px)');
  const hot = useChangedErrand();
  const { done, total } = errandCount(quests);

  if (compact) {
    return (
      <button type="button" className={`tracker-chip chip${hot ? ' is-hot' : ''}`} onClick={() => G().setPanel('quests')}
        aria-label={`Errands, ${done} of ${total} done. Open the errand log.`}>
        <span className="eyebrow">Errands</span>
        <Pips n={done} total={total} />
      </button>
    );
  }
  return (
    <section className={`tracker chip${folded ? ' is-folded' : ''}`} aria-label="Errands">
      <button type="button" className="tracker-head" onClick={(e) => { setTrackerFolded(!folded); if (e.detail) e.currentTarget.blur(); }}
        aria-expanded={!folded}>
        <span className="eyebrow">Errands</span>
        <span className="tracker-count">{done}/{total}</span>
        <span className="tracker-key" aria-hidden="true"><KeyCap k="J" /></span>
        <span className="tracker-fold" aria-hidden="true">{folded ? '+' : '–'}</span>
      </button>
      {!folded && (
        <ul className="errands">
          {QUESTS.map((d) => <ErrandLine key={d.id} def={d} q={quests[d.id] ?? fresh(d.id)} hot={hot === d.id} />)}
        </ul>
      )}
    </section>
  );
}

/** Rupees, merit and what Tenzin carries. */
export function Purse() {
  const rupees = useGame((s) => s.rupees);
  const merit = useGame((s) => s.merit);
  const inv = useGame((s) => s.inventory);
  const puppy = useGame((s) => !!s.flags.puppyFollowing);
  const delta = useDelta(pickRupees);
  const meritDelta = useDelta(pickMerit);
  const items = ITEM_DEFS.filter((d) => (d.id === 'puppy' ? puppy : (inv[d.id] ?? 0) > 0));
  return (
    <div className="purse">
      <div className="purse-row">
        <span className="chip pchip" title="Rupees">
          <PixelIcon grid={COIN} size={24} />
          <span className="pnum"><span className="rs" aria-hidden="true">₹</span>{rupees}</span>
          <span className="sr-only">rupees</span>
          {delta && <span key={delta.k} className={`pdelta ${delta.v > 0 ? 'up' : 'down'}`} aria-hidden="true">{delta.v > 0 ? '+' : '−'}₹{Math.abs(delta.v)}</span>}
        </span>
        <span className="chip pchip" title="Merit: turns of the prayer wheels">
          <span className="om" lang="bo" aria-hidden="true">ཨོཾ</span>
          <span className="pnum">{merit}</span>
          <span className="sr-only">merit</span>
          {meritDelta && meritDelta.v > 0 && <span key={meritDelta.k} className="pdelta merit" aria-hidden="true">+{meritDelta.v}</span>}
        </span>
      </div>
      {items.length > 0 && (
        <ul className="satchel chip" aria-label="Carrying">
          {items.map((d) => {
            const n = d.id === 'puppy' ? 1 : inv[d.id] ?? 0;
            return (
              <li key={d.id} title={d.name} className="satchel-item">
                <PixelIcon grid={d.grid} size={24} title={d.name} />
                {n > 1 && <span className="satchel-n">×{n}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The last change of a store number, for the little "+60" that floats off a chip. */
function useDelta(pick: (s: ReturnType<typeof G>) => number) {
  const [d, setD] = useState<{ v: number; k: number } | null>(null);
  useEffect(() => {
    let t = 0;
    const unsub = useGame.subscribe((s, p) => {
      const dv = pick(s) - pick(p);
      if (!dv) return;
      setD({ v: dv, k: performance.now() });
      clearTimeout(t);
      t = window.setTimeout(() => setD(null), 1600);
    });
    return () => { unsub(); clearTimeout(t); };
  }, [pick]);
  return d;
}

const pickRupees = (s: ReturnType<typeof G>) => s.rupees;
const pickMerit = (s: ReturnType<typeof G>) => s.merit;
