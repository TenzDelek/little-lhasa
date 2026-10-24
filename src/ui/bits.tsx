// Small shared HUD pieces: pixel icons, key caps, progress pips, the day/night glyph.
import { memo, useMemo } from 'react';
import { MOON, SUN, runs, type Grid } from './pixels';

export const PixelIcon = memo(function PixelIcon({ grid, size = 24, title }: { grid: Grid; size?: number; title?: string }) {
  const rects = useMemo(() => runs(grid), [grid]);
  const w = grid.rows[0].length, h = grid.rows.length;
  return (
    <svg className="px-icon" width={size} height={(size * h) / w} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges"
      role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      {rects.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.c} />)}
    </svg>
  );
});

export function KeyCap({ k }: { k: string }) {
  return <kbd className="kc">{k}</kbd>;
}

/** A row of square pips: `n` of `total` filled. */
export function Pips({ n, total, label }: { n: number; total: number; label?: string }) {
  const c = Math.min(n, total);
  return (
    <span className="pips" role="img" aria-label={label ?? `${c} of ${total}`}>
      {Array.from({ length: total }, (_, i) => <i key={i} className={i < c ? 'on' : undefined} />)}
    </span>
  );
}

export function DayGlyph({ night, size = 12 }: { night: boolean; size?: number }) {
  return <PixelIcon grid={night ? MOON : SUN} size={size} />;
}
