// Runtime for the people of McLeod Ganj: one rigid-skinned figure per person (rig.ts), simulated every frame
// and animated only near the camera. Walkers follow routes (routes.ts / town.ts), pause to look at shop
// windows, take photos or chat, step aside for Tenzin and for each other; standers sell, chat in groups,
// pray or debate. Everyone is talkable, glances at Tenzin when he passes close, and some pop a speech
// bubble. At night most townsfolk go home (hidden while out of view, or quickly when the switch happens).
import { Frustum, Group, Matrix4, Sphere, Vector3, type Camera } from 'three';
import { buildCharacter, animateCharacter, type Action, type AnimInput, type Rig } from '../rig';
import { collision, type CircleCollider } from '../../core/collision';
import { interactions } from '../../core/interact';
import { game } from '../../core/game';
import { angleDelta, clamp, damp, dampAngle, rng } from '../../core/math';
import { Parts } from '../../core/geom';
import { partsMaterial } from '../../core/materials';
import { PAL } from '../../core/palette';
import { G } from '../../game/store';
import { talkTo } from '../../game/quests';
import { roadById, roadFrame, NPC_IDS, QUEST } from '../../world/layout';
import { groundY } from '../../world/terrain';
import { CAST, SHOPFRONTS, type NpcDef, type Spot } from './cast';
import { avoid, footDist, probe, sample, wrapS, type Route, type RoutePoint } from './routes';
import { buildRoutes } from './town';
import { Bubbles, type BubbleOwner } from './bubbles';
import { ALL_PHRASES, BYE, EXCUSE, GREET, HINTS, PEMA_HAPPY, TALK } from './lines';
import { AMALA, SOURCES } from './places';

const ANIM_DIST = 45, SHOW_DIST = 70;
const TIBETAN_KINDS = new Set(['monk', 'nun', 'debater', 'elderF', 'elderM', 'womanShop', 'youth', 'kid', 'shopkeeper', 'tashi', 'dolma', 'balep', 'amala', 'pema']);
const TALK_ANIM_WAVE = new Set(['kid', 'youth', 'touristIn', 'touristW']);

export interface Npc extends BubbleOwner {
  def: NpcDef;
  rig: Rig;
  // pose in the world
  x: number; y: number; z: number; yaw: number; visY: number;
  home: Spot;
  // walking
  route: Route | null; s: number; cur: number; lateral: number;
  side: number; sideTarget: number; sideHold: number;
  block: number; blockT: number;
  leader: Npc | null; followers: Npc[];
  tx: number; tz: number; nx: number; nz: number;
  pauseIn: number; paused: number; pauseKind: 'look' | 'photo' | 'chat' | null;
  // upper body
  act: Action | null; actT: number; idleIn: number;
  look: number; pitch: number; chatT: number;
  // social
  talking: boolean; byeT: number; greetCD: number; excuseCD: number; convo: number;
  // presence
  present: boolean; goneDelay: number; animate: boolean;
  /** Present and near enough to simulate socially (collider, talkable). */
  active: boolean;
  collider: CircleCollider;
  ipos: Vector3;
  hop: number;
  heardPuppy: boolean;
  /** Height of the bubble anchor above the feet (lower for people sitting). */
  headOff: number;
}

const _pt: RoutePoint = { x: 0, z: 0, y: 0, tx: 0, tz: 1, nx: -1, nz: 0 };
const _anim: AnimInput = { dt: 0, time: 0, speed: 0, grounded: true, vy: 0, action: null, actionT: 0, lookYaw: 0, lookPitch: 0, seatY: undefined };
const _hit = { f: 1, push: 0 };
const _frustum = new Frustum(), _pv = new Matrix4(), _v = new Vector3(), _sph = new Sphere(new Vector3(), 2.2);

const rnd = Math.random;
const NONE: readonly string[] = [];
const PEMA_LIST: readonly string[] = [PEMA_HAPPY];
const expo = (mean: number) => -Math.log(1 - rnd() * 0.95) * mean;

export class NpcSystem {
  readonly group = new Group();
  readonly npcs: Npc[] = [];
  readonly byId = new Map<string, Npc>();
  readonly routes: Record<string, Route>;
  readonly bubbles: Bubbles;
  private seenVersion = -1;
  private pendingVersion = -1;
  private pendingAt = 0;
  private checkT = 0;
  private clock = 0;
  private night = false;
  private talkingNpc: Npc | null = null;
  private bubbleCD = 0;
  private groupT = new Map<string, { speaker: number; t: number }>();
  private groupList: { speaker: number; t: number }[] = [];
  private extras: Group;
  /** Our own people's colliders, and a cached list of everyone else's moving bodies (dogs, cows, the puppy, monkeys). */
  private own = new Set<CircleCollider>();
  private others: CircleCollider[] = [];

  constructor() {
    this.group.name = 'npcs';
    this.routes = buildRoutes();
    this.bubbles = new Bubbles(ALL_PHRASES, 5);
    this.group.add(this.bubbles.group);
    const r = rng(99);

    for (const def of CAST) {
      const rig = buildCharacter(def.spec);
      rig.root.name = `npc:${def.id}`;
      const route = def.route ? this.routes[def.route] ?? null : null;
      const n: Npc = {
        def, rig, x: 0, y: 0, z: 0, yaw: 0, visY: 0,
        home: { x: 0, z: 0, yaw: 0 },
        route, s: def.s ?? 0, cur: 0, lateral: def.lateral ?? 0,
        side: 0, sideTarget: 0, sideHold: 0, block: 1, blockT: 0,
        leader: null, followers: [], tx: 0, tz: 1, nx: -1, nz: 0,
        pauseIn: def.pauseEvery ? expo(def.pauseEvery) : Infinity, paused: 0, pauseKind: null,
        act: null, actT: r() * 10, idleIn: 1 + r() * 6,
        look: 0, pitch: 0, chatT: r() * 6,
        talking: false, byeT: 0, greetCD: 2 + r() * 4, excuseCD: 0, convo: Math.floor(r() * 4),
        present: true, goneDelay: -1, animate: true, shown: true, active: true,
        collider: { kind: 'circle', x: 0, z: 0, r: 0.25, y0: -1e5, y1: -1e5 + 1 },
        head: new Vector3(), ipos: new Vector3(), hop: 0, heardPuppy: false, headOff: headOffset(def, rig),
      };
      this.npcs.push(n);
      this.byId.set(def.id, n);
      this.group.add(rig.root);
    }
    for (const n of this.npcs) {
      if (!n.def.leader) continue;
      const L = this.byId.get(n.def.leader);
      if (!L) continue;
      n.leader = L; n.route = L.route; L.followers.push(n);
    }
    this.extras = this.buildExtras();
    this.group.add(this.extras);
    this.rebuild();
    for (const n of this.npcs) this.place(n, true);
    this.positionWalkers(0);
    for (const n of this.npcs) n.visY = n.y;
  }

  // ---- static extras: cushions for the seated debaters (unless the temple has its own), Amala's bench if
  // the hillside has none ------------------------------------------------------------------------------
  private cushions: Group | null = null;
  private bench: Group | null = null;
  private buildExtras(): Group {
    const g = new Group();
    const cush = new Parts(), bench = new Parts();
    for (const n of this.npcs) {
      if (n.def.mode !== 'debateSit') continue;
      const at = this.spotOf(n.def);
      const y = groundY(at.x, at.z);
      cush.group([at.x, y, at.z], at.yaw, () => {
        cush.box(0.6, 0.08, 0.55, [0, 0.04, -0.02], PAL.monkMaroonDark);
        cush.box(0.54, 0.02, 0.5, [0, 0.09, -0.02], PAL.monkMaroon);
      });
    }
    {
      const y = groundY(AMALA.x, AMALA.z);
      bench.group([AMALA.x, y, AMALA.z], AMALA.yaw, () => {
        bench.box(1.5, 0.06, 0.42, [0, 0.42, 0], PAL.woodTrim);
        for (const sx of [-0.62, 0.62]) bench.box(0.08, 0.42, 0.36, [sx, 0.2, 0], PAL.woodDoor);
        bench.box(1.5, 0.05, 0.05, [0, 0.1, -0.12], PAL.woodDoor);
      });
    }
    const mat = partsMaterial({ key: 'npc-extras' });
    if (cush.size) {
      this.cushions = new Group();
      for (const m of cush.toMeshes(mat, 64)) { m.receiveShadow = true; this.cushions.add(m); }
      g.add(this.cushions);
    }
    this.bench = new Group();
    for (const m of bench.toMeshes(mat, 64)) { m.castShadow = true; m.receiveShadow = true; this.bench.add(m); }
    g.add(this.bench);
    return g;
  }

  private spotOf(def: NpcDef): Spot {
    if (!def.at) return { x: 0, z: 0, yaw: 0 };
    return typeof def.at === 'function' ? def.at() : def.at;
  }

  // ---- placement ---------------------------------------------------------------------------------------
  /** Re-bend routes round colliders and re-place standers (runs when other modules add colliders). */
  rebuild() {
    for (const r of Object.values(this.routes)) avoid(r);
    for (const n of this.npcs) {
      if (n.def.mode === 'walk') continue;
      let at = this.spotOf(n.def);
      const sf = SHOPFRONTS[n.def.id];
      if (sf) at = shopfront(sf.road, sf.s, sf.side);
      else if (n.def.mode === 'stand' && !n.def.group && n.def.id !== NPC_IDS.pema) at = freeSpot(at);
      n.home = at;
    }
    // Amala's bench belongs to the hillside module; draw a stand-in only while there is no seat under her
    if (this.bench) this.bench.visible = !seatAt(AMALA.x, AMALA.z);
    // the temple's debate platform has its own cushions: hide ours when the defenders sit up on it
    if (this.cushions) {
      let onPlatform = false;
      for (const n of this.npcs) if (n.def.mode === 'debateSit' && probe(n.home.x, n.home.z, 0.2).lift > 0.12) onPlatform = true;
      this.cushions.visible = !onPlatform;
    }
    this.seenVersion = collision.version;
  }

  private place(n: Npc, snap: boolean) {
    if (n.def.mode === 'walk') return;
    n.x = n.home.x; n.z = n.home.z;
    if (snap) n.yaw = n.home.yaw;
    n.y = groundY(n.x, n.z) + probe(n.x, n.z, 0.2).lift;
    if (snap) n.visY = n.y;
  }

  // ---- mounting: colliders, interactables ---------------------------------------------------------------
  mount(): () => void {
    const offs: (() => void)[] = [];
    for (const n of this.npcs) {
      const d = collision.addDynamic(n.collider);
      n.collider = d.collider;
      this.own.add(d.collider);
      offs.push(d.remove);
      const def = n.def;
      const radius = def.mode === 'sit' ? 2.1 : def.idleAct === 'talk' || def.idleAct === 'give' ? 1.9 : 1.7;
      offs.push(interactions.add({
        id: `npc-${def.id}`,
        pos: () => n.ipos,
        radius,
        label: def.label,
        // quest givers win over anything else in reach; vendors compete fairly with their own stall's "Buy …"
        priority: def.id === NPC_IDS.pema || def.id === NPC_IDS.amala ? 2 : def.idleAct === 'talk' || def.idleAct === 'give' ? 1 : 0,
        anim: TALK_ANIM_WAVE.has(def.kind) ? 'wave' : 'talk',
        enabled: () => n.active,
        onInteract: () => this.talk(n),
      }));
    }
    // test handle (dev builds only), next to window.__game / __store
    const w = window as unknown as Record<string, unknown>;
    if (import.meta.env.DEV) w.__npcs = { sys: this, collision, sources: SOURCES, probe, footDist };
    this.refreshOthers();
    return () => {
      for (const o of offs) o();
      this.own.clear(); this.others.length = 0;
      if (w.__npcs && (w.__npcs as { sys: NpcSystem }).sys === this) delete w.__npcs;
    };
  }

  /** Errand-aware lines (hints) that replace the small talk while they matter. */
  private hint(n: Npc): readonly string[] | null {
    const s = G(), q = s.quests;
    const kind = n.def.kind;
    const momo = q[QUEST.momos], pup = q[QUEST.puppy];
    if (n.def.id === NPC_IDS.tashi && momo && momo.stage === 1 && !momo.done) return HINTS.tashiMomos;
    const lost = pup && pup.stage === 1 && !pup.done && !s.flags.puppyFollowing;
    if (lost && kind === 'taxi') return HINTS.taxiPuppy;
    if (lost && kind === 'teaAuntie') return HINTS.teaPuppy;
    if (pup?.done && TIBETAN_KINDS.has(kind) && kind !== 'pema' && kind !== 'amala' && !n.heardPuppy) { n.heardPuppy = true; return HINTS.puppyHome; }
    return null;
  }

  private talk(n: Npc) {
    const def = n.def;
    const pool = TALK[def.kind] ?? TALK.monk;
    const hint = this.hint(n);
    const convo = hint ?? pool[n.convo % pool.length];
    if (!hint) n.convo++;
    const lines = convo.map((text) => ({ who: def.name, bod: def.bod, text }));
    if (this.talkingNpc) this.talkingNpc.talking = false;
    n.talking = true;
    this.talkingNpc = n;
    this.bubbles.hide(n);
    talkTo(def.id, lines);
  }

  // ---- per frame ---------------------------------------------------------------------------------------
  update(camera: Camera, rawDt: number) {
    const dt = game.dt;
    this.clock += Math.min(rawDt, 0.1);

    // re-check colliders twice a second; rebuild once they have been stable for a moment
    this.checkT -= Math.min(rawDt, 0.1);
    if (this.checkT <= 0) {
      this.checkT = 0.5;
      this.refreshOthers();
      if (collision.version !== this.seenVersion) {
        if (collision.version !== this.pendingVersion) { this.pendingVersion = collision.version; this.pendingAt = this.clock; }
        else if (this.clock - this.pendingAt > 0.6) {
          this.rebuild();
          for (const n of this.npcs) this.place(n, false);
        }
      }
    }

    const s = G();
    if (s.night !== this.night) this.switchNight(s.night, camera);

    if (this.talkingNpc && !s.dialogue) {
      const t = this.talkingNpc;
      t.talking = false; t.byeT = 7;
      this.talkingNpc = null;
    }

    if (dt > 0) {
      this.bubbleCD -= dt;
      this.stepWalkers(dt);
      this.stepGroups(dt);
    }

    const P = game.player.pos;
    const ct = game.cam.target;
    const puppyHome = !!s.flags.puppyHome;
    // the rig turns off three's frustum culling (skinned bounds), so cull whole people here; the sphere is
    // generous so shadows of people just off screen still fall into view
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pv);
    for (const n of this.npcs) {
      // presence (night)
      if (n.goneDelay >= 0) {
        n.goneDelay -= Math.min(rawDt, 0.1);
        if (n.goneDelay < 0) n.present = !this.night || n.def.night === 'stay';
      }
      const dc = Math.hypot(n.x - ct.x, n.z - ct.z);
      n.active = n.present && dc < SHOW_DIST;
      _sph.center.set(n.x, n.y + 0.9, n.z);
      const vis = n.active && _frustum.intersectsSphere(_sph);
      n.rig.root.visible = vis;
      n.shown = vis;
      n.animate = vis && dc < ANIM_DIST;
      if (!n.active) { n.collider.y0 = -1e5; n.collider.y1 = -1e5 + 1; continue; }

      if (dt > 0) this.think(n, dt, P, puppyHome);

      // vertical: ease up steps, drop instantly
      n.visY = n.y > n.visY + 0.03 ? damp(n.visY, n.y, 16, dt) : n.y;
      const root = n.rig.root;
      root.position.set(n.x, n.visY + n.hop, n.z);
      root.rotation.y = n.yaw;
      n.collider.x = n.x; n.collider.z = n.z; n.collider.y0 = n.y; n.collider.y1 = n.y + n.rig.dims.H;
      n.ipos.set(n.x, n.y, n.z);
      n.head.set(n.x, n.visY + n.headOff, n.z);
    }

    this.bubbles.update(camera, Math.min(rawDt, 0.1));
  }

  /** Moving bodies that are not our people (cached: the set only changes when animals mount / unmount). */
  private refreshOthers() {
    this.others.length = 0;
    for (const c of collision.dynamics()) if (!this.own.has(c)) this.others.push(c);
  }

  // ---- walkers -----------------------------------------------------------------------------------------
  private stepWalkers(dt: number) {
    // leaders set the pace for their little group
    for (const n of this.npcs) {
      if (n.def.mode !== 'walk' || n.leader || !n.route) continue;
      let want = n.def.speed ?? 1;
      const grp = n.followers;
      let talking = n.talking, block = n.block;
      for (const f of grp) { talking ||= f.talking; block = Math.min(block, f.block); }
      // pauses
      if (n.paused > 0) {
        n.paused -= dt;
        if (n.paused <= 0) { n.pauseKind = null; n.pauseIn = expo(n.def.pauseEvery ?? 60); }
      } else if ((n.pauseIn -= dt) <= 0 && block > 0.9 && !talking) {
        n.paused = 2.5 + rnd() * 4;
        n.pauseKind = n.def.pauseKind ?? 'look';
      }
      if (n.paused > 0 || talking) want = 0;
      // keep a little gap behind slower walkers on the same route
      want = Math.min(want * block, this.gapLimit(n, want));
      n.cur = damp(n.cur, want, want < n.cur ? 7 : 3, dt);
      if (n.cur < 0.02 && want === 0) n.cur = 0;
      n.s = wrapS(n.route, n.s + n.cur * dt);
      for (const f of grp) {
        f.s = wrapS(n.route, n.s + (f.def.ds ?? 0));
        f.cur = n.cur; f.paused = n.paused; f.pauseKind = n.pauseKind;
      }
    }
    this.positionWalkers(dt);
    // obstacles: Tenzin, then everyone else
    const P = game.player.pos;
    for (const n of this.npcs) {
      if (n.def.mode !== 'walk' || !n.route || !n.present) continue;
      let block = 1, push = 0, byPlayer = false;
      const moving = n.cur > 0.05 || (n.leader ? n.leader.cur > 0.05 : false) || n.block < 0.5;
      if (moving && !n.talking) {
        if (this.ahead(n, P.x, P.z, 0.62)) {
          block = Math.min(block, _hit.f); push += _hit.push;
          if (_hit.f < 0.3) { n.blockT += dt; byPlayer = true; }
        }
        for (const m of this.npcs) {
          if (m === n || !m.present || m.leader === n || n.leader === m || (n.leader && m.leader === n.leader)) continue;
          if (Math.abs(m.x - n.x) > 1.6 || Math.abs(m.z - n.z) > 1.6) continue;
          if (this.ahead(n, m.x, m.z, 0.5)) { block = Math.min(block, Math.max(0.35, _hit.f)); push += _hit.push * 0.8; }
        }
        // animals: step round dogs, cows, the puppy (slow down, never stop for good: a dog asleep on the
        // pavement is walked round, or at worst stepped past)
        for (let k = 0; k < this.others.length; k++) {
          const c = this.others[k];
          if (c.y1 < n.y + 0.05 || c.y0 > n.y + 1.5) continue;
          if (Math.abs(c.x - n.x) > 2.4 || Math.abs(c.z - n.z) > 2.4) continue;
          if (this.ahead(n, c.x, c.z, 0.3 + c.r, 2.2)) { block = Math.min(block, Math.max(0.3, _hit.f)); push += _hit.push; }
        }
      }
      if (!byPlayer) n.blockT = Math.max(0, n.blockT - dt * 2);
      n.block = damp(n.block, block, block < n.block ? 10 : 2.5, dt);
      if (push !== 0) { n.sideTarget = this.clampSide(n, n.sideTarget + push * dt * 3); n.sideHold = 1.3; }
      else if ((n.sideHold -= dt) <= 0) n.sideTarget = damp(n.sideTarget, 0, 1.5, dt);
      // stuck behind Tenzin: say so
      if (n.blockT > 1.3 && (n.excuseCD -= dt) <= 0 && this.bubbleCD <= 0) {
        if (this.bubbles.show(n, EXCUSE[n.def.kind] ?? EXCUSE.default, 1.8)) { n.excuseCD = 14; this.bubbleCD = 1.2; }
        n.blockT = 0;
      } else if (n.excuseCD > 0) n.excuseCD -= dt;
    }
  }

  /** Walkers' world positions from their route arc length and sideways offset. */
  private positionWalkers(dt: number) {
    for (const n of this.npcs) {
      if (n.def.mode !== 'walk' || !n.route) continue;
      n.side = damp(n.side, n.sideTarget, 3.5, dt);
      sample(n.route, n.s, n.lateral + n.side, _pt);
      n.x = _pt.x; n.z = _pt.z; n.y = _pt.y;
      n.tx = _pt.tx; n.tz = _pt.tz; n.nx = _pt.nx; n.nz = _pt.nz;
    }
  }

  /**
   * Is (px, pz) in n's way? Writes the slow-down factor and a sideways push (along n's right normal) into
   * _hit and returns true.
   */
  private ahead(n: Npc, px: number, pz: number, clear: number, look = 1.7): boolean {
    const dx = px - n.x, dz = pz - n.z;
    const fwd = dx * n.tx + dz * n.tz;
    if (fwd <= -0.1 || fwd > look) return false;
    const lat = dx * n.nx + dz * n.nz;
    if (Math.abs(lat) > clear + 0.15) return false;
    const dir = Math.abs(lat) < 0.05 ? (n.route?.inward || 1) : -Math.sign(lat);
    _hit.f = clamp((fwd - 0.55) / 0.9);
    _hit.push = dir * (clear + 0.2 - Math.abs(lat));
    return true;
  }

  /** Keep side-steps within what the route allows (more room toward the road centre than the shop fronts). */
  private clampSide(n: Npc, v: number) {
    const r = n.route!;
    const inw = r.inward || 1;
    const lo = inw > 0 ? -r.sideOut : -r.sideIn, hi = inw > 0 ? r.sideIn : r.sideOut;
    return clamp(v, lo, hi);
  }

  /** Speed limit from the nearest walker ahead on the same route (same direction). */
  private gapLimit(n: Npc, want: number): number {
    const r = n.route!;
    let lim = want;
    for (const m of this.npcs) {
      if (m === n || m.route !== r || m.leader || !m.present || m.def.mode !== 'walk') continue;
      let gap = m.s - n.s;
      if (r.loop) gap = ((gap % r.len) + r.len) % r.len;
      if (gap <= 0 || gap > 2.2) continue;
      if (Math.abs(m.lateral + m.side - n.lateral - n.side) > 0.75) continue;
      lim = Math.min(lim, Math.max(m.cur, 0) + Math.max(0, gap - 1.2) * 0.8);
      // try to overtake on the inward side
      if (want > m.cur + 0.15 && gap < 1.8) { n.sideTarget = this.clampSide(n, n.sideTarget + 0.02 * (r.inward || 1)); n.sideHold = 1.5; }
    }
    return lim;
  }

  // ---- standing chat groups take turns -----------------------------------------------------------------
  private stepGroups(dt: number) {
    if (!this.groupList.length) for (const n of this.npcs) {
      const g = n.def.group;
      if (!g || this.groupT.has(g)) continue;
      const st = { speaker: 0, t: 2 + rnd() * 3 };
      this.groupT.set(g, st); this.groupList.push(st);
    }
    for (const st of this.groupList) {
      st.t -= dt;
      if (st.t <= 0) { st.speaker = (st.speaker + 1 + Math.floor(rnd() * 2)) % 7; st.t = 2.5 + rnd() * 3; }
    }
  }

  // ---- behaviour & animation for one visible person ------------------------------------------------------
  private think(n: Npc, dt: number, P: Vector3, puppyHome: boolean) {
    const def = n.def;
    const dx = P.x - n.x, dz = P.z - n.z;
    const dP = Math.hypot(dx, dz);
    const toP = Math.atan2(dx, dz);
    const near = dP < 3.6 && Math.abs(P.y - n.y) < 2.5;

    let action: Action | null = null;
    let seatY: number | undefined;
    let lookYaw = 0, lookPitch = 0;
    let yawWant = n.yaw;
    let speed = 0;
    n.hop = 0;

    if (def.mode === 'walk') {
      speed = n.cur;
      yawWant = Math.atan2(n.tx, n.tz);
      action = def.walkAct ?? null;
      if (n.paused > 0 || (n.leader && n.leader.paused > 0)) {
        const kind = n.pauseKind ?? n.leader?.pauseKind ?? 'look';
        const inw = n.route?.inward || 1;
        if (kind === 'chat') {
          const other = n.leader ?? n.followers[0];
          if (other) yawWant = Math.atan2(other.x - n.x, other.z - n.z);
          if (!n.leader && n.followers.length > 1) yawWant = Math.atan2(-n.tx, -n.tz);
          n.chatT -= dt;
          if (n.chatT < -2.5) n.chatT = 1.5 + rnd() * 2.5;
          if (n.chatT < 0) action = 'talk';
        } else {
          yawWant = Math.atan2(-n.nx * inw, -n.nz * inw); // face the shop side
          if (kind === 'photo') action = def.spec.holdR === 'phone' || def.spec.holdL === 'phone' ? 'phone' : 'point';
          else lookPitch = 0.12;
        }
      } else if (n.followers.length || n.leader) {
        // pairs talk as they walk
        n.chatT -= dt;
        if (n.chatT < -2.2) n.chatT = 3 + rnd() * 5;
        if (n.chatT < 0 && !action) {
          action = 'talk';
          const other = n.leader ?? n.followers[0];
          lookYaw = clamp(angleDelta(n.yaw, Math.atan2(other.x - n.x, other.z - n.z)), -0.9, 0.9);
        }
      }
    } else if (def.mode === 'stand') {
      yawWant = n.home.yaw;
      if (def.group) {
        // face the group's centre, talk in turns
        let cx = 0, cz = 0, k = 0, me = 0;
        for (const m of this.npcs) if (m.def.group === def.group) { if (m === n) me = k; cx += m.x; cz += m.z; k++; }
        cx /= k; cz /= k;
        yawWant = Math.atan2(cx - n.x, cz - n.z) + (me % 2 ? 0.25 : -0.25);
        const st = this.groupT.get(def.group);
        if (st && st.speaker % k === me) action = 'talk';
        else if (st) {
          let j = 0;
          for (const m of this.npcs) if (m.def.group === def.group) { if (j === st.speaker % k) lookYaw = clamp(angleDelta(n.yaw, Math.atan2(m.x - n.x, m.z - n.z)), -1, 1); j++; }
        }
      } else if (def.id === NPC_IDS.pema) {
        if (!puppyHome) {
          lookPitch = 0.55;
          n.idleIn -= dt;
          if (n.idleIn < 0) { action = 'eat'; if (n.idleIn < -1.4) n.idleIn = 4 + rnd() * 5; } // rubbing her eyes
        } else {
          lookYaw = Math.sin(n.actT * 0.7) * 0.8;
          const hopPhase = (n.actT % 4.2);
          if (hopPhase < 1.2) n.hop = Math.abs(Math.sin(hopPhase * Math.PI * 2.5)) * 0.07;
          if (near && dP < 2.6) action = 'wave';
        }
      } else if (def.idleAct) {
        // vendor patter / photos / chai: loop the action on and off; more often when Tenzin is near
        n.idleIn -= dt * (near ? 2 : 1);
        if (n.idleIn < 0) {
          action = def.idleAct;
          if (n.idleIn < -(def.idleAct === 'phone' ? 5 : 2.6)) n.idleIn = def.idleAct === 'phone' ? 2.5 + rnd() * 3 : 3 + rnd() * 6;
        }
        if (near && !n.talking) yawWant = n.home.yaw + clamp(angleDelta(n.home.yaw, toP), -0.7, 0.7);
      }
    } else if (def.mode === 'sit') {
      action = 'sit'; seatY = def.seatY ?? SEAT_BENCH;
      yawWant = n.home.yaw;
    } else if (def.mode === 'pray') {
      yawWant = n.home.yaw;
      const p = (game.time + (def.phase ?? 0)) % 9;
      action = p < 6.5 ? 'pray' : 'bow';
    } else if (def.mode === 'debateStand') {
      yawWant = n.home.yaw;
      action = 'clap';
    } else if (def.mode === 'debateSit') {
      action = 'sitCross'; seatY = def.seatY ?? SEAT_CUSHION;
      yawWant = n.home.yaw;
      lookPitch = -0.28;
    }

    // Tenzin: talking → face him; close by → glance at him
    if (n.talking) {
      const free = def.mode === 'walk' || def.mode === 'stand' || def.mode === 'pray';
      if (free) { yawWant = toP; action = 'talk'; }
      else yawWant = n.home.yaw + clamp(angleDelta(n.home.yaw, toP), -0.45, 0.45);
      lookYaw = clamp(angleDelta(yawWant, toP), -1, 1);
    } else if (near) {
      const d = angleDelta(n.yaw, toP);
      if (Math.abs(d) < 2.1) lookYaw = clamp(d, -1.05, 1.05) * (dP < 2.2 ? 1 : 0.8);
    }
    if (def.id === NPC_IDS.pema && !puppyHome && !n.talking) lookYaw *= 0.4;

    n.yaw = dampAngle(n.yaw, yawWant, n.talking ? 7 : 5, dt);
    n.look = damp(n.look, lookYaw, 6, dt);
    n.pitch = damp(n.pitch, lookPitch, 5, dt);

    if (action !== n.act) { n.act = action; n.actT = 0; }
    n.actT += dt;

    // bubbles: greetings, Pema's good news, "kale phe" when Tenzin walks off after a talk
    if (n.greetCD > 0) n.greetCD -= dt;
    if (n.byeT > 0) {
      n.byeT -= dt;
      if (dP > 2.8 && TIBETAN_KINDS.has(def.kind) && this.bubbles.show(n, BYE, 2)) n.byeT = 0;
    } else if (near && dP < 3.1 && !this.talkingNpc && n.greetCD <= 0 && this.bubbleCD <= 0 && this.bubbles.active < 2) {
      const phrases = def.id === NPC_IDS.pema ? (puppyHome ? PEMA_LIST : NONE) : GREET[def.kind] ?? NONE;
      if (phrases.length && rnd() < (def.greet ?? (def.id === NPC_IDS.pema ? 0.8 : 0.4))) {
        if (this.bubbles.show(n, phrases[Math.floor(rnd() * phrases.length)], 2.2)) { this.bubbleCD = 1.4; n.greetCD = 28 + rnd() * 20; }
      } else n.greetCD = 9 + rnd() * 6;
    }

    if (!n.animate) return;
    _anim.dt = dt; _anim.time = game.time; _anim.speed = speed; _anim.grounded = true; _anim.vy = 0;
    _anim.action = action; _anim.actionT = action === 'clap' ? game.time + (def.phase ?? 0) : n.actT;
    _anim.lookYaw = n.look; _anim.lookPitch = n.pitch; _anim.seatY = seatY;
    animateCharacter(n.rig, _anim);
    this.overrides(n, dt);
  }

  /** Extra poses the rig's action set does not cover (applied after animateCharacter). */
  private overrides(n: Npc, _dt: number) {
    const b = n.rig.bones, def = n.def, t = game.time + (def.phase ?? 0);
    if (def.id === NPC_IDS.amala && !n.talking) {
      // spin the hand prayer wheel (right) and count the mala (left) while she sits
      b.armR.rotation.set(-0.3, 0, -0.12); b.foreR.rotation.set(-1.35, 0, 0); b.handR.rotation.set(0, 0, Math.sin(t * 6) * 0.25);
      b.armL.rotation.set(-0.45, 0, 0.05); b.foreL.rotation.set(-1.15 + Math.sin(t * 3) * 0.06, 0, 0);
    } else if (def.id === NPC_IDS.amala) {
      // talking: wheel at rest, the mala hand does the talking
      b.armR.rotation.set(-0.3, 0, -0.12); b.foreR.rotation.set(-1.35, 0, 0);
      b.armL.rotation.set(-0.55 + Math.sin(t * 2.3) * 0.12, 0, 0.12); b.foreL.rotation.set(-1.05 + Math.sin(t * 3.7) * 0.25, 0, 0);
      b.head.rotation.x += Math.sin(t * 4.1) * 0.05;
    }
    if (def.mode === 'debateSit') {
      // cross-legged on the cushion (rig 'sitCross'); answer with a raised hand every other clap
      const p = (t % 3.4) / 3.4;
      if (p > 0.45 && p < 0.8) { b.armR.rotation.set(-0.9, 0, -0.2); b.foreR.rotation.set(-1.0 + Math.sin(t * 5) * 0.2, 0, 0); }
    }
    if (def.reach && n.cur > 0.05) {
      // right hand brushing the wall wheels as they pass
      b.armR.rotation.set(-0.35, 0, -0.7 + Math.sin(t * 4) * 0.08);
      b.foreR.rotation.set(-0.45, 0, 0);
      b.handR.rotation.set(0, 0, Math.sin(t * 9) * 0.3);
      b.head.rotation.y = -0.45;
    }
  }

  // ---- night ---------------------------------------------------------------------------------------------
  private switchNight(night: boolean, camera: Camera) {
    this.night = night;
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pv);
    for (const n of this.npcs) {
      if (n.def.night === 'stay') continue;
      if (n.talking) { n.goneDelay = 5; continue; }
      const seen = n.rig.root.visible && _frustum.containsPoint(_v.set(n.x, n.y + 1, n.z));
      n.goneDelay = seen ? 0.25 + rnd() * 1.6 : 0;
    }
  }

  dispose() {
    this.bubbles.dispose();
    for (const n of this.npcs) n.rig.mesh.geometry.dispose();
    for (const m of this.extras.children) (m as { geometry?: { dispose(): void } }).geometry?.dispose();
  }
}


// ---- placement helpers -----------------------------------------------------------------------------------
const SEAT_BENCH = 0.45, SEAT_CUSHION = 0.1;

/** Bubble anchor height above the feet: just over the head, standing or sitting (matches rig 'sit' / 'sitCross'). */
function headOffset(def: NpcDef, rig: Rig) {
  const d = rig.dims;
  if (def.mode === 'sit') return d.H - (d.hipJ - ((def.seatY ?? SEAT_BENCH) + d.legT * 0.5)) + 0.1;
  if (def.mode === 'debateSit') return d.H - (d.hipJ - ((def.seatY ?? SEAT_CUSHION) + d.legT * 0.5 + 0.015)) + 0.1;
  return d.H + 0.14;
}
/** Nearest free standing spot to `at` (rings out to 1.6 m). */
function freeSpot(at: Spot): Spot {
  if (!probe(at.x, at.z, 0.26).blocked) return at;
  for (let rr = 0.25; rr <= 1.6; rr += 0.25) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const x = at.x + Math.sin(a) * rr, z = at.z + Math.cos(a) * rr;
      if (!probe(x, z, 0.26).blocked) return { x, z, yaw: at.yaw };
    }
  }
  return at;
}

/** Stand in front of the building that faces `road` at arc length s on one side, facing the road. */
function shopfront(roadId: string, s: number, side: 1 | -1): Spot {
  const road = roadById(roadId);
  const f = roadFrame(road, s);
  const half = road.width / 2;
  let stand = half + 0.9;
  for (let off = half + 0.3; off <= half + 6; off += 0.2) {
    const x = f.x + f.nx * side * off, z = f.z + f.nz * side * off;
    if (tallAt(x, z)) { stand = Math.max(half + 0.35, off - 0.5); break; }
  }
  const at = { x: f.x + f.nx * side * stand, z: f.z + f.nz * side * stand, yaw: Math.atan2(-f.nx * side, -f.nz * side) };
  return freeSpot(at);
}


/** Is there something bench-high (a seat) right under (x, z)? */
function seatAt(x: number, z: number) {
  const g = groundY(x, z);
  for (const c of collision.query(x, z, 0.2)) if (c.y1 > g + 0.28 && c.y1 < g + 0.75 && footDist(c, x, z) < 0.1) return true;
  return false;
}

/** A wall / building (taller than a person) right at (x, z)? */
function tallAt(x: number, z: number) {
  const g = groundY(x, z);
  for (const c of collision.query(x, z, 0.3)) {
    if (c.y1 < g + 1.8 || c.y0 > g + 1.0) continue;
    const dx = x - c.x, dz = z - c.z;
    if (c.kind === 'circle') { if (Math.hypot(dx, dz) < c.r + 0.15) return true; continue; }
    const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
    const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
    if (Math.abs(lx) < c.w / 2 + 0.15 && Math.abs(lz) < c.d / 2 + 0.15) return true;
  }
  return false;
}
