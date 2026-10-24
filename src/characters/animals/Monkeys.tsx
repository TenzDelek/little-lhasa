// Monkeys. A troop of rhesus macaques (brown-grey, pink faces) on the rooftops and walls of Temple Road,
// and grey langurs (black faces, very long tails) in the forest along the kora. They sit, groom each other,
// scratch, walk along roof edges and leap away in big arcs when Tenzin comes close (sfx 'monkey').
// Rooftops are found at runtime from the building colliders (tag 'building', y1 = roof top) and refreshed as
// the town registers them; until then the troop waits on the pavements. At night the macaques huddle together
// on one roof and the langurs doze where they sit.
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Group, Vector3 } from 'three';
import { collision, type BoxCollider, type CircleCollider } from '../../core/collision';
import { game } from '../../core/game';
import { angleDelta, clamp, damp, dampAngle, rng, type Rng } from '../../core/math';
import { roadById, roadFrame, roadLength } from '../../world/layout';
import { groundY, roadQuery, walkable } from '../../world/terrain';
import { animateQuad, CATCH_UP_DT, snapQuad, type QPose, type QuadRig } from './quad';
import { View } from '../cull';
import { buildLangur, buildMacaque } from './species';
import {
  animalsBus, blocked, floorAt, freeSpot, hdist, isNight, openToward, perchPoint, pumpTops, requestTop, roofPerches, setProbeScene, sfxAt, topsStatus, TO_CAM, edgeSeat, resolveSeat, type EdgeSeat,
  type Perch, type TopQuery,
} from './nav';

type Kind = 'macaque' | 'langur';
type St = 'sit' | 'walk' | 'leap' | 'land' | 'groom' | 'groomed' | 'sleep';

interface Leap { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; T: number; H: number; perch: Perch; u: number; then: Perch | null }

interface Monkey {
  kind: Kind; rig: QuadRig; r: Rng; pos: Vector3; yaw: number;
  perch: Perch; u: number; walkU: number;
  st: St; t: number; dur: number;
  look: number; lookT: number; lookWant: number; scratch: number; scratchT: number;
  leap: Leap | null; partner: Monkey | null; fleeCD: number;
  bus: { pos: Vector3; leaping: boolean };
  home: number;
  /** Dynamic collider (blocks people when the monkey is down at their level; parked mid-leap). */
  dyn: CircleCollider | null;
}

const MAC_N = 6, LANGUR_N = 4;
/** The default iso camera sits to the south-east: edges facing it are never hidden behind their own roof. */
const VIEW = [Math.SQRT1_2, Math.SQRT1_2] as const;
let troopCry = 0;

// ---- perches ------------------------------------------------------------------------------------------------
function groundPerch(x: number, z: number, yaw: number, ex: number, ez: number, half: number): Perch {
  return { x, y: groundY(x, z), z, yaw, ex, ez, half, owner: null };
}

/** Pavement spots along Temple Road (fallback until rooftops exist). */
function templeGround(): Perch[] {
  const road = roadById('temple-road');
  const out: Perch[] = [];
  for (let s = 9; s < 84; s += 7) {
    const f = roadFrame(road, s);
    for (const side of [1, -1]) {
      const x = f.x + f.nx * 3.75 * side, z = f.z + f.nz * 3.75 * side;
      out.push(groundPerch(x, z, Math.atan2(-f.nx * side, -f.nz * side), f.tx, f.tz, 1.1));
    }
  }
  return out;
}

/** Forest-side spots along the kora (outer side of the path, facing it). */
function koraGround(): Perch[] {
  const road = roadById('kora-path');
  const L = roadLength(road);
  const out: Perch[] = [];
  for (let s = 6; s < L - 4; s += 8.5) {
    const f = roadFrame(road, s);
    // forest side (outside the loop) and the grass verge on the temple side, both facing the path
    for (const side of [-1, 1]) {
      const lat = side * (road.width / 2 + (side < 0 ? 1.3 : 1.1));
      const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
      out.push(groundPerch(x, z, Math.atan2(-f.nx * side, -f.nz * side), f.tx, f.tz, 1.0));
    }
  }
  return out;
}

/**
 * Keep a ground perch only if its middle is free, and shorten its run so a monkey sitting anywhere along it
 * (offsets up to ±half) stays clear of walls, posts and stalls.
 */
function fitGround(p: Perch): boolean {
  const free = (u: number) => {
    const x = p.x + p.ex * u, z = p.z + p.ez * u;
    return walkable(x, z) && !blocked(x, groundY(x, z), z, 0.2, 0.5, false);
  };
  if (!free(0)) return false;
  let h = 0;
  while (h + 0.25 <= p.half && free(h + 0.25) && free(-h - 0.25)) h += 0.25;
  p.half = Math.max(0.01, h);
  return true;
}

function nearRoad(c: BoxCollider, id: string, edge: number, sMin = 0, sMax = 1e9) {
  const rq = roadQuery(c.x, c.z);
  return rq.road.id === id && rq.edge < edge && rq.s > sMin && rq.s < sMax;
}
const heightOk = (c: BoxCollider, lo: number, hi: number) => {
  const h = c.y1 - groundY(c.x, c.z);
  return h > lo && h < hi;
};

function perchesFor(kind: Kind): Perch[] {
  if (kind === 'macaque') {
    const roofs = roofPerches((c) => (c.tag === 'building' || c.tag === 'parapet') && nearRoad(c, 'temple-road', 15, 3) && heightOk(c, 1.5, 18), 0.1, 0.6, VIEW);
    const walls = roofPerches((c) => (c.tag === 'wall' || c.tag === 'railing') && (nearRoad(c, 'temple-road', 10, 3) || nearRoad(c, 'kora-path', 6)) && heightOk(c, 0.8, 4), 0.02, 0.25);
    const all = [...roofs, ...walls];
    return all.length >= 3 ? all : [...all, ...templeGround().filter(fitGround)];
  }
  const walls = roofPerches((c) => (c.tag === 'wall' || c.tag === 'rock') && nearRoad(c, 'kora-path', 8) && heightOk(c, 0.3, 3.5), 0.02, 0.25);
  return [...koraGround().filter(fitGround), ...walls];
}

// Real seats along each roof perch (parapet tops, tin roof slopes, the true edge past an overhang), sampled
// every 0.4 m with nav.ts edgeSeat (batched queries, answered within a few frames of a rescan; until then the
// collider top).
const STEP = 0.4;
type Seat = EdgeSeat;
const seat = resolveSeat;
const heights = new WeakMap<Perch, Seat[]>();
const _rp = new Vector3();
function hOf(p: Perch): Seat[] {
  let h = heights.get(p);
  if (!h) {
    h = [];
    if (p.owner) {
      const n = Math.max(1, Math.round((p.half * 2) / STEP) + 1);
      const nx = Math.sin(p.yaw), nz = Math.cos(p.yaw);
      for (let i = 0; i < n; i++) { perchPoint(p, -p.half + i * STEP, _rp); h.push(edgeSeat(_rp.x, _rp.z, nx, nz, p.y)); }
    }
    heights.set(p, h);
  }
  return h;
}
const _sa = { y: 0, off: 0 };
/** Seat height and inset at offset u along a perch. */
function seatOn(p: Perch, u: number) {
  const h = hOf(p);
  if (!h.length) { _sa.y = p.y; _sa.off = 0; return _sa; }
  const f = clamp((u + p.half) / STEP, 0, h.length - 1);
  const i = Math.floor(f), j = Math.min(h.length - 1, i + 1), k = f - i;
  const a = seat(h[i]), b = seat(h[j]);
  const ya = a.ok ? a.y : p.y, yb = b.ok ? b.y : ya;
  _sa.y = ya + (yb - ya) * k;
  _sa.off = a.ok && b.ok ? a.off + (b.off - a.off) * k : a.ok ? a.off : 0;
  return _sa;
}
const heightAt = (p: Perch, u: number) => seatOn(p, u).y;
const heightsDone = (p: Perch) => { for (const st of hOf(p)) if (!seat(st).ok) return false; return true; };

/** Perches the default camera can see (no collider between them and the south-east sky). */
const seen = new WeakMap<Perch, boolean>();
/** Check a few perches a frame; returns false when every perch has been checked. */
function seeSome(list: Perch[], n: number): boolean {
  let more = false;
  for (const p of list) {
    if (seen.has(p)) continue;
    if (!heightsDone(p)) { more = true; continue; }
    if (n-- <= 0) return true;
    const y = p.owner ? heightAt(p, 0) : groundY(p.x, p.z);
    seen.set(p, openToward(p.x, y + 0.35, p.z, TO_CAM[0], TO_CAM[1], TO_CAM[2]));
  }
  return more;
}

/** Ground perches under a tree canopy (the langurs prefer to sit where they can be seen). */
const canopy = new WeakMap<Perch, TopQuery>();
function covered(p: Perch): boolean {
  if (p.owner) return false;
  let q = canopy.get(p);
  if (!q) { const g = groundY(p.x, p.z); q = requestTop(p.x, p.z, g + 1.2, 7); canopy.set(p, q); }
  return q.done && q.y > groundY(p.x, p.z) + 1.4;
}
/** Queue every height / canopy query for a perch list (one batch after a rescan). */
function queueAll(list: Perch[]) { for (const p of list) { hOf(p); covered(p); } }

const _seat = new Vector3();
/** Put a monkey at offset u on a perch, at the real surface height there (parapet top, roof slope, ground). */
function seatAt(perch: Perch, u: number, out: Vector3) {
  perchPoint(perch, u, out);
  if (!perch.owner) { out.y = floorAt(out.x, out.z, groundY(out.x, out.z) + 0.3, 0.15, 0.3); return out; }
  const st = seatOn(perch, u);
  out.x += Math.sin(perch.yaw) * st.off; out.z += Math.cos(perch.yaw) * st.off; out.y = st.y;
  return out;
}

// ---- component -------------------------------------------------------------------------------------------------
export function Monkeys() {
  const view = useMemo(() => new View(), []);
  const S = useMemo(() => {
    const group = new Group();
    const perches: Record<Kind, Perch[]> = { macaque: perchesFor('macaque'), langur: perchesFor('langur') };
    const r = rng(777);
    const monkeys: Monkey[] = [];
    const mk = (kind: Kind, i: number, perch: Perch) => {
      const rig = kind === 'macaque' ? buildMacaque(i + 1) : buildLangur(i + 1);
      rig.root.name = `${kind}-${i}`;
      group.add(rig.root);
      const u = (r() - 0.5) * perch.half * 1.6;
      const pos = seatAt(perch, u, new Vector3());
      const m: Monkey = {
        kind, rig, r: rng(900 + i * 13 + (kind === 'langur' ? 50 : 0)), pos, yaw: perch.yaw + (r() - 0.5) * 0.8,
        perch, u, walkU: u, st: 'sit', t: 0, dur: 4 + r() * 8,
        look: 0, lookT: 0, lookWant: 0, scratch: 0, scratchT: 3 + r() * 8,
        leap: null, partner: null, fleeCD: 0, bus: { pos, leaping: false }, home: 0, dyn: null,
      };
      monkeys.push(m);
      return m;
    };
    // macaques: four around Tashi's momo stall, two down by the temple gate
    const mac = perches.macaque;
    const pickNear = (list: Perch[], x: number, z: number, k: number) =>
      [...list].sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[k % list.length];
    for (let i = 0; i < MAC_N; i++) {
      const p = i < 4 ? pickNear(mac, 6, 30, Math.floor(i / 2)) : pickNear(mac, 7, 84, i - 4);
      mk('macaque', i, p);
    }
    const lan = perches.langur;
    const at = [5, 5, 12, 23];
    for (let i = 0; i < LANGUR_N; i++) mk('langur', i, lan[Math.min(lan.length - 1, at[i])] ?? lan[0]);
    for (const m of monkeys) {
      m.home = monkeys.indexOf(m);
      snapQuad(m.rig);
      m.rig.root.position.copy(m.pos);
      m.rig.root.rotation.y = m.yaw;
    }
    return { group, perches, monkeys, version: -1, huddleVersion: -2, seenDone: false, scanT: 0, scans: 0, huddle: null as Perch | null, nightWas: false };
  }, []);

  const scene = useThree((s) => s.scene);
  useEffect(() => { setProbeScene(scene); }, [scene]);

  useEffect(() => {
    const offs = S.monkeys.map((m) => {
      const d = collision.addDynamic({ x: m.pos.x, z: m.pos.z, r: m.kind === 'langur' ? 0.26 : 0.2, y0: m.pos.y, y1: m.pos.y + 0.6 });
      m.dyn = d.collider;
      return d.remove;
    });
    return () => { offs.forEach((f) => f()); for (const m of S.monkeys) m.dyn = null; };
  }, [S]);

  useEffect(() => {
    animalsBus.monkeys = S.monkeys.filter((m) => m.kind === 'macaque').map((m) => m.bus);
    // test hook: window.__monkeys() → state of every monkey
    const w = window as unknown as { __monkeys?: () => unknown };
    w.__monkeys = () => ({
      tops: topsStatus(),
      hs: S.perches.macaque.slice(0, 60).map((p) => [+p.x.toFixed(1), +p.z.toFixed(1), +p.y.toFixed(2), +heightAt(p, 0).toFixed(2), +seatOn(p, 0).off.toFixed(2), p.owner?.tag, seen.get(p) ? 1 : 0]),
      perches: { macaque: S.perches.macaque.length, roofs: S.perches.macaque.filter((p) => p.owner).length, langur: S.perches.langur.length },
      list: S.monkeys.map((m) => ({ k: m.kind[0], st: m.st, p: m.pos.toArray().map((v) => +v.toFixed(2)), u: +m.u.toFixed(2), half: +m.perch.half.toFixed(2), roof: !!m.perch.owner, tag: m.perch.owner?.tag })),
    });
    return () => { animalsBus.monkeys = []; delete w.__monkeys; };
  }, [S]);

  useFrame((state, raw) => {
    const dt = game.dt;
    const P = game.player.pos;

    // rescan perches as buildings register (0.5 s, 2 s, 6 s, 15 s, then whenever colliders change). Real time,
    // so it runs behind the loading and title screens too: the troop is up on the roofs, not sitting in a shop
    // front, when play starts
    S.scanT += Math.min(raw, 0.1);
    const due = S.scans < 4 ? S.scanT > [0.5, 2, 6, 15][S.scans] : S.scanT > 20 + S.scans * 2;
    if (due && collision.version !== S.version) {
      S.version = collision.version;
      S.perches.macaque = perchesFor('macaque');
      S.perches.langur = perchesFor('langur');
      queueAll(S.perches.macaque); queueAll(S.perches.langur);
      S.scans++;
      S.seenDone = false;
      // something new built where a monkey sits on the ground (a shed, a post): it moves on at once, unseen
      // ones simply taken to a free ground perch of their own kind
      for (const m of S.monkeys) {
        if (m.perch.owner !== null || m.st === 'leap' || m.st === 'land') continue;
        if (!blocked(m.pos.x, groundY(m.pos.x, m.pos.z), m.pos.z, 0.2, 0.5, false)) continue;
        m.partner = null;
        const list = S.perches[m.kind].filter((p) => p.owner === null);
        if ((hdist(m.pos, P) > 22 || game.time < 6) && list.length) {
          let best = list[0], bd = Infinity;
          for (const p of list) { const d = Math.hypot(p.x - m.pos.x, p.z - m.pos.z); if (d < bd) { bd = d; best = p; } }
          m.perch = best; m.u = m.walkU = roomOn(S, m, best, 0); seatAt(best, m.u, m.pos);
          m.st = m.st === 'sleep' ? 'sleep' : 'sit'; m.t = 0;
          m.rig.root.position.copy(m.pos);
        } else { m.st = 'sit'; m.t = 0; m.dur = 0.2; m.home = -1; }
      }
      // monkeys still sitting on the pavement go up onto the roofs: unseen ones are simply moved there,
      // ones in view leap up
      const roofs = S.perches.macaque.filter((p) => p.owner !== null);
      for (const m of S.monkeys) {
        if (m.kind !== 'macaque' || m.perch.owner !== null || m.st !== 'sit' || !roofs.length) continue;
        if (hdist(m.pos, P) > 22 || game.time < 6) {
          let best = roofs[0], bd = Infinity;
          for (const p of roofs) {
            const crowd = S.monkeys.filter((o) => o.perch === p).length;
            const d = Math.hypot(p.x - m.pos.x, p.z - m.pos.z) + crowd * 4;
            if (d < bd) { bd = d; best = p; }
          }
          m.perch = best; m.u = m.walkU = roomOn(S, m, best, (m.r() - 0.5) * best.half); seatAt(best, m.u, m.pos);
          m.yaw = best.yaw + (m.r() - 0.5) * 0.8;
          m.rig.root.position.copy(m.pos);
        } else {
          m.dur = Math.min(m.dur, m.t + 0.5 + m.r() * 3);
          m.home = -1; // next decision: leap somewhere new
        }
      }
    } else if (due) S.scans++;

    if (dt <= 0) return;
    const night = isNight();
    troopCry -= dt;
    view.update(state.camera);

    // night: the troop gathers on one roof (re-chosen when the rooftops change)
    if (night !== S.nightWas || (night && S.huddleVersion !== S.version)) {
      const fresh = night !== S.nightWas;
      S.nightWas = night;
      if (night) {
        S.huddleVersion = S.version;
        const mac = S.monkeys.filter((m) => m.kind === 'macaque');
        const cx = mac.reduce((a, m) => a + m.pos.x, 0) / mac.length, cz = mac.reduce((a, m) => a + m.pos.z, 0) / mac.length;
        const list = S.perches.macaque.filter((p) => p.half > 0.55);
        const roofs = list.filter((p) => p.owner);
        const views = roofs.filter((p) => seen.get(p) === true && p.half > 0.8);
        const pool = views.length ? views : roofs.length ? roofs : list;
        S.huddle = pool.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0] ?? null;
        mac.forEach((m, i) => {
          if (S.huddle && m.perch !== S.huddle && (game.time < 8 || hdist(m.pos, P) > 25)) {
            // out of sight: already there, asleep
            const u = clamp((i - 2.5) * 0.3, -S.huddle.half, S.huddle.half);
            m.perch = S.huddle; m.u = m.walkU = u; seatAt(S.huddle, u, m.pos);
            m.st = 'sleep'; m.t = 0; m.leap = null; m.partner = null;
            m.yaw = S.huddle.yaw + (m.r() - 0.5) * 0.6;
          } else if (fresh || m.perch !== S.huddle) {
            if (m.st !== 'leap') { m.st = 'sit'; m.t = 0; m.partner = null; }
            m.dur = m.t + 0.3 + i * 0.9 + m.r();
          }
        });
      } else {
        S.huddle = null;
        for (const m of S.monkeys) if (m.st === 'sleep') { m.st = 'sit'; m.t = 0; m.dur = 1 + m.r() * 6; m.home = -1; }
      }
    }

    // real perch heights (batched, time-sliced), then which perches the camera can see
    if (S.scans > 0 && !pumpTops(1.5) && !S.seenDone) {
      if (!seeSome(S.perches.macaque, 6)) {
        // every perch checked: at night, re-pick the huddle among the visible ones
        S.seenDone = true;
        if (night) S.huddleVersion = -3;
      }
    }

    for (const m of S.monkeys) {
      const dxz = hdist(m.pos, P);
      // drawn (and animated) only on screen; up on a roof the shadow falls further away, so the sphere grows
      const was = m.rig.root.visible;
      const lift = Math.max(0, m.pos.y - groundY(m.pos.x, m.pos.z));
      const shown = (dxz < 70 || m.st === 'leap') && view.sees(m.pos.x, m.pos.y + 0.3, m.pos.z, 1.5 + lift * 0.8);
      m.rig.root.visible = shown;
      if (m.perch.owner && (m.st === 'sit' || m.st === 'groom' || m.st === 'groomed' || m.st === 'sleep' || m.st === 'land')) {
        // settle onto the real seat as the height queries come in
        seatAt(m.perch, m.u, _seat);
        m.pos.x = damp(m.pos.x, _seat.x, 12, dt); m.pos.y = damp(m.pos.y, _seat.y, 12, dt); m.pos.z = damp(m.pos.z, _seat.z, 12, dt);
      }
      if (dxz > 70 && m.st !== 'leap') continue;
      think(S, m, dt, dxz, night);
      pose(m, dt, dxz, shown ? (was ? dt : CATCH_UP_DT) : 0);
      m.bus.leaping = m.st === 'leap';
      if (m.dyn) {
        const park = m.st === 'leap';
        m.dyn.x = park ? 1e6 : m.pos.x; m.dyn.z = park ? 1e6 : m.pos.z;
        m.dyn.y0 = m.pos.y; m.dyn.y1 = m.pos.y + 0.6;
      }
    }
  });

  return <primitive object={S.group} />;
}

type World = { perches: Record<Kind, Perch[]>; monkeys: Monkey[]; huddle: Perch | null };

function think(S: World, m: Monkey, dt: number, dxz: number, night: boolean) {
  const P = game.player.pos;
  m.t += dt;
  m.fleeCD -= dt;

  // ---- flee -------------------------------------------------------------------------------------------------
  if (m.st !== 'leap' && m.st !== 'land' && m.fleeCD <= 0) {
    const dy = m.pos.y - P.y;
    const d3 = Math.hypot(dxz, dy);
    const threat = m.kind === 'macaque'
      ? (dxz < 3.0 && dy > -1 && dy < 11) || d3 < 3.6
      : dxz < 4.6 && Math.abs(dy) < 3;
    const sleepy = m.st === 'sleep' && dxz > 1.8;
    if (threat && !sleepy) {
      if (startLeap(S, m, true)) {
        m.fleeCD = 3.5;
        if (troopCry <= 0) { troopCry = 1.2; sfxAt('monkey', m.pos.x, m.pos.z, m.kind === 'langur' ? 0.7 : 0.9); }
        // the rest of the troop looks round
        for (const o of S.monkeys) if (o !== m && o.kind === m.kind && hdist(o.pos, m.pos) < 8) { o.lookWant = clamp(angleDelta(o.yaw, Math.atan2(P.x - o.pos.x, P.z - o.pos.z)), -1.3, 1.3); o.lookT = 2; }
        return;
      }
    }
  }

  switch (m.st) {
    case 'leap': {
      const L = m.leap!;
      const k = clamp(m.t / L.T);
      m.pos.set(L.x0 + (L.x1 - L.x0) * k, L.y0 + (L.y1 - L.y0) * k + 4 * L.H * k * (1 - k), L.z0 + (L.z1 - L.z0) * k);
      if (k >= 1) {
        m.perch = L.perch; m.u = L.u; m.walkU = L.u;
        if (L.then) {
          // ground bounding: chain the next hop
          if (!queueLeap(m, L.then, (m.r() - 0.5) * L.then.half, m.kind === 'langur' ? 3.4 : 9)) { m.st = 'land'; m.t = 0; }
        } else { m.st = 'land'; m.t = 0; m.leap = null; }
      }
      break;
    }
    case 'land': {
      if (m.t > 0.3) {
        m.st = 'sit'; m.t = 0; m.dur = 3 + m.r() * 6;
        m.yaw = m.perch.yaw + (m.r() - 0.5) * 0.9;
      }
      break;
    }
    case 'walk': {
      const du = m.walkU - m.u;
      const step = Math.sign(du) * Math.min(Math.abs(du), 0.55 * dt);
      m.u += step;
      seatAt(m.perch, m.u, m.pos);
      const wy = Math.atan2(m.perch.ex * Math.sign(du || 1), m.perch.ez * Math.sign(du || 1));
      m.yaw = dampAngle(m.yaw, wy, 6, dt);
      if (Math.abs(du) < 0.02) { m.st = 'sit'; m.t = 0; m.dur = 4 + m.r() * 7; }
      break;
    }
    case 'groom':
    case 'groomed': {
      const o = m.partner;
      if (!o || (o.st !== 'groom' && o.st !== 'groomed') || m.t > m.dur) {
        m.st = 'sit'; m.t = 0; m.dur = 3 + m.r() * 5; m.partner = null;
        break;
      }
      if (m.st === 'groom') m.yaw = dampAngle(m.yaw, Math.atan2(o.pos.x - m.pos.x, o.pos.z - m.pos.z), 4, dt);
      break;
    }
    case 'sleep': {
      if (!night) { m.st = 'sit'; m.t = 0; m.dur = 1 + m.r() * 5; }
      break;
    }
    case 'sit': {
      if (m.t < m.dur) break;
      // decide what next
      if (night) {
        if (m.kind === 'macaque' && S.huddle && m.perch !== S.huddle) {
          const i = S.monkeys.filter((o) => o.kind === 'macaque').indexOf(m);
          const u = clamp((i - 2.5) * 0.3, -S.huddle.half, S.huddle.half);
          if (queueLeap(m, S.huddle, u, 18)) break;
          // too far for one leap: just appear there (it's dark)
          m.perch = S.huddle; m.u = u; seatAt(S.huddle, u, m.pos);
        }
        m.st = 'sleep'; m.t = 0; m.yaw = m.perch.yaw + (m.r() - 0.5) * 0.6;
        break;
      }
      const roll = m.r() - (covered(m.perch) ? 0.25 : 0);
      if (m.home === -1 || roll < 0.18) { m.home = 0; if (startLeap(S, m, false)) break; }
      if (roll < 0.45) {
        // walk along the edge
        m.walkU = roomOn(S, m, m.perch, clamp(m.u + (m.r() - 0.5) * 2.4, -m.perch.half, m.perch.half));
        if (Math.abs(m.walkU - m.u) > 0.25) { m.st = 'walk'; m.t = 0; break; }
      }
      if (roll < 0.75) {
        // groom a neighbour
        const o = S.monkeys.find((o) => o !== m && o.kind === m.kind && o.st === 'sit' && hdist(o.pos, m.pos) < 1.1 && Math.abs(o.pos.y - m.pos.y) < 0.3);
        if (o) {
          m.st = 'groom'; o.st = 'groomed'; m.partner = o; o.partner = m;
          m.t = o.t = 0; m.dur = o.dur = 8 + m.r() * 8;
          break;
        }
      }
      m.t = 0; m.dur = 3 + m.r() * 7;
      if (m.r() < 0.4) m.yaw = m.perch.yaw + (m.r() - 0.5) * 1.2;
      break;
    }
  }
}

/** Nudge an offset along a perch so it keeps ~0.4 m from the other monkeys there (no two in one spot). */
function roomOn(S: World, m: Monkey, p: Perch, u: number): number {
  for (let k = 0; k < 4; k++) {
    let clash: Monkey | null = null;
    for (const o of S.monkeys) if (o !== m && o.perch === p && Math.abs(o.u - u) < 0.4) { clash = o; break; }
    if (!clash) return u;
    const side = u >= clash.u ? 1 : -1;
    u = clash.u + side * 0.42;
    if (Math.abs(u) > p.half) u = clash.u - side * 0.42;
    u = clamp(u, -p.half, p.half);
  }
  return u;
}

/** Leap to another perch (fleeing: away from the boy). Returns false if nowhere suitable. */
function startLeap(S: World, m: Monkey, flee: boolean): boolean {
  const P = game.player.pos;
  const list = S.perches[m.kind];
  const maxD = m.kind === 'macaque' ? 10 : 12;
  let best: Perch | null = null, bestS = -Infinity, bestU = 0;
  const _v = new Vector3();
  for (const p of list) {
    if (p === m.perch && !(m.kind === 'langur' && flee)) continue;
    const u = roomOn(S, m, p, (m.r() - 0.5) * p.half * 1.6);
    perchPoint(p, u, _v);
    const d = Math.hypot(_v.x - m.pos.x, _v.y - m.pos.y, _v.z - m.pos.z);
    if (d < 1.8 || d > maxD) continue;
    let crowd = 0;
    for (const o of S.monkeys) if (o !== m && o.perch === p) crowd++;
    if (crowd > 2) continue;
    const away = Math.hypot(_v.x - P.x, _v.z - P.z) + Math.max(0, _v.y - P.y) * 0.6;
    const s = flee
      ? away * 1.5 - Math.abs(d - 5) * 0.2 + m.r() * 1.5 - (away < 4.5 ? 20 : 0) - (covered(p) ? 1 : 0)
      : -Math.abs(d - 4.5) * 0.5 + m.r() * 3 + (p.owner ? 1.5 : 0) + (seen.get(p) ? 1.5 : 0) - crowd - (covered(p) ? 2.5 : 0);
    if (s > bestS) { bestS = s; best = p; bestU = u; }
  }
  if (!best) return false;
  return queueLeap(m, best, bestU, m.kind === 'langur' ? 3.4 : maxD);
}

/** Start an arc toward (perch, u); long ground runs are split into bounds of at most `hop` metres. */
function queueLeap(m: Monkey, perch: Perch, u: number, hop: number): boolean {
  const to = seatAt(perch, u, new Vector3());
  const dx = to.x - m.pos.x, dz = to.z - m.pos.z;
  let d = Math.hypot(dx, dz, to.y - m.pos.y);
  if (d < 0.1) return false;
  let then: Perch | null = null;
  if (d > hop && perch.owner === null && m.pos.y - groundY(m.pos.x, m.pos.z) < 0.5) {
    // bound partway along the ground
    const k = hop / d;
    let x = m.pos.x + dx * k, z = m.pos.z + dz * k;
    // never touch down inside a wall or a post on the way: the nearest free spot instead
    if (blocked(x, groundY(x, z), z, 0.2, 0.5, false)) { const f = freeSpot(x, z, 0.2, 0.5, 1.5); if (f) { x = f.x; z = f.z; } }
    const mid = { x, y: floorAt(x, z, groundY(x, z) + 0.3, 0.15, 0.3), z, yaw: perch.yaw, ex: perch.ex, ez: perch.ez, half: 0.01, owner: null } as Perch;
    then = perch; perch = mid; u = 0; to.set(mid.x, mid.y, mid.z);
    d = Math.hypot(to.x - m.pos.x, to.z - m.pos.z, to.y - m.pos.y);
  }
  const ground = perch.owner === null && m.pos.y - groundY(m.pos.x, m.pos.z) < 0.5;
  m.leap = {
    x0: m.pos.x, y0: m.pos.y, z0: m.pos.z, x1: to.x, y1: to.y, z1: to.z,
    T: ground ? 0.32 + d * 0.06 : 0.45 + d * 0.065,
    H: (ground ? 0.25 + d * 0.06 : 0.55 + d * 0.12) + (Math.max(m.pos.y, to.y) - (m.pos.y + to.y) / 2),
    perch, u, then,
  };
  m.st = 'leap'; m.t = 0; m.partner = null;
  m.yaw = Math.atan2(to.x - m.pos.x, to.z - m.pos.z);
  return true;
}

/** Head / scratch timers, then the rig (animated with `adt`: 0 while culled, a catch-up step on showing). */
function pose(m: Monkey, dt: number, dxz: number, adt: number) {
  const P = game.player.pos;
  // head: glance around, look at the boy when he is near
  m.lookT -= dt;
  if (m.lookT <= 0) {
    m.lookT = 1.2 + m.r() * 3;
    m.lookWant = dxz < 7 && m.r() < 0.6 ? clamp(angleDelta(m.yaw, Math.atan2(P.x - m.pos.x, P.z - m.pos.z)), -1.3, 1.3) : (m.r() - 0.5) * 2;
  }
  m.look = damp(m.look, m.lookWant, 5, dt);
  m.scratchT -= dt;
  if (m.scratchT <= 0) { m.scratchT = 6 + m.r() * 12; m.scratch = 1.6; }
  m.scratch = Math.max(0, m.scratch - dt);

  let p: QPose = 'sit', speed = 0, air = false, vy = 0;
  switch (m.st) {
    case 'leap': {
      const L = m.leap!;
      const k = clamp(m.t / L.T);
      air = true; vy = ((L.y1 - L.y0) + 4 * L.H * (1 - 2 * k)) / L.T; p = 'stand';
      break;
    }
    case 'land': p = 'stand'; break;
    case 'walk': p = 'stand'; speed = 0.55; break;
    case 'sleep': p = 'hunch'; break;
    case 'groomed': p = 'hunch'; break;
  }
  const raised = m.perch.owner !== null && m.pos.y - groundY(m.pos.x, m.pos.z) > 0.6;
  animateQuad(m.rig, {
    dt: adt, time: game.time, speed, pose: p, poseRate: 7, air, vy,
    lookYaw: m.st === 'sit' ? m.look : 0, lookPitch: m.st === 'groom' ? 0.3 : raised && m.st === 'sit' ? 0.25 : 0,
    groom: m.st === 'groom' ? 1 : 0,
    scratch: m.st === 'sit' && m.scratch > 0 ? 1 : 0,
    sleep: m.st === 'sleep',
    tailLift: m.kind === 'langur' ? (raised ? -0.2 : 0.95) : (p === 'stand' ? 1.2 : 0),
    rate: m.st === 'leap' ? 18 : 12,
  });
  m.rig.root.position.copy(m.pos);
  m.rig.root.rotation.y = m.yaw;
}
