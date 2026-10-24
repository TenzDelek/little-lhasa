// Loading state (Gorshey's "Lighting the fire…", here five pixel butter lamps that catch one by one) shown
// on plain paper until store.ready — the world has built and rendered its first frames — then it fades away
// to reveal the town and the title. index.css shows the same caption on #root:empty before React mounts.
import { useEffect, useState } from 'react';
import { useGame } from '../game/store';
import { runs, type Grid } from './pixels';

const BRASS = { h: '#e2b45a', b: '#bf8932', d: '#8a5e22', u: '#f3e0ad', k: '#3a2a1d' };
const FIRE = { f: '#e8822a', Y: '#f6c24e', O: '#fff3cf' };

/** A brass chömé: butter in the cup, a stemmed foot. 9 × 14, flame rows 0-4 drawn separately. */
const CUP: Grid = {
  pal: BRASS,
  rows: [
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '....k....',
    '.huuuuud.',
    'hbbbbbbbd',
    '.hbbbbbd.',
    '..hbbbd..',
    '...hbd...',
    '...hbd...',
    '..hbbbd..',
    '.hhbbbdd.',
  ],
};
const FLAME_A: Grid = {
  pal: FIRE,
  rows: ['....f....', '...fYf...', '...fOf...', '..fYOYf..', '...YOY...'],
};
const FLAME_B: Grid = {
  pal: FIRE,
  rows: ['.....f...', '....fY...', '...fOf...', '..fYOYf..', '...YOY...'],
};

function Pixels({ grid, className, w, h }: { grid: Grid; className: string; w: number; h: number }) {
  return (
    <svg className={className} width={w * 3} height={h * 3} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" aria-hidden="true">
      {runs(grid).map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.c} />)}
    </svg>
  );
}

/** One lamp. The lighting sequence and the flicker are CSS opacity animations on their own layers (see
 *  hud.css), so they keep running on the compositor while the main thread is busy building the town. */
function Lamp() {
  return (
    <span className="lamp">
      <span className="lamp-fire">
        <i className="lamp-glow" />
        <Pixels grid={FLAME_A} className="lamp-flame lamp-flame-a" w={9} h={5} />
        <Pixels grid={FLAME_B} className="lamp-flame lamp-flame-b" w={9} h={5} />
      </span>
      <Pixels grid={CUP} className="lamp-cup" w={9} h={14} />
    </span>
  );
}

export function Loading() {
  const ready = useGame((s) => s.ready);
  const [gone, setGone] = useState(ready);
  const [slow, setSlow] = useState(0);

  useEffect(() => {
    if (ready) { const t = window.setTimeout(() => setGone(true), 1100); return () => clearTimeout(t); }
    const s1 = window.setTimeout(() => setSlow(1), 15000);
    const s2 = window.setTimeout(() => setSlow(2), 45000);
    return () => { clearTimeout(s1); clearTimeout(s2); };
  }, [ready]);

  if (gone) return null;
  return (
    <div className={`loading${ready ? ' is-done' : ''}`} role="status" aria-live="polite" aria-busy={!ready}>
      <div className="loading-in">
        <div className="lamps" aria-hidden="true">
          <Lamp /><Lamp /><Lamp /><Lamp /><Lamp />
        </div>
        <p className="loading-text">{ready ? 'The lamps are lit' : 'Lighting the butter lamps…'}</p>
        {slow > 0 && !ready && (
          <p className="loading-note">
            {slow === 1
              ? 'The whole town is being built — the first visit takes a little longer.'
              : 'Still dark? Try reloading the page, or a recent Chrome, Edge or Safari.'}
          </p>
        )}
      </div>
    </div>
  );
}
