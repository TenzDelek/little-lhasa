// Cards that sit over the town: the errand log (J), controls (H) and the pause menu (Esc). Paper cards,
// square corners, keyboard driven (↑↓ move, Enter picks, Esc closes — Esc itself is handled by GameSystems).
import { useEffect, useRef, type ReactNode } from 'react';
import { G, useGame, type QuestState } from '../game/store';
import { QUESTS } from '../game/quests';
import { input } from '../core/input';
import { ITEM_DEFS, ROT_L, ROT_R } from './pixels';
import { ErrandLine } from './TopBar';
import { KeyCap, PixelIcon } from './bits';
import { ConfirmNew } from './Title';
import { errandCount, useMedia, useUi } from './ctl';

function Card({ className, eyebrow, title, bod, onClose, children, label }: {
  className?: string; eyebrow: string; title: string; bod?: string; onClose: () => void; children: ReactNode; label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    // focus the card itself (no ring), so Tab / ↑↓ walk into it and Esc closes it
    (ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current)?.focus({ preventScroll: true });
    return () => { if (prev && prev !== document.body && document.contains(prev)) prev.focus({ preventScroll: true }); };
  }, []);
  return (
    <div ref={ref} className={`card ${className ?? ''}`} role="dialog" aria-modal="true" aria-label={label} data-nav tabIndex={-1}>
      <header className="card-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="card-title"><span className="latin">{title}</span>{bod && <span className="bod" lang="bo">{bod}</span>}</h2>
        </div>
        <button type="button" className="btn btn-close" onClick={onClose} aria-label="Close">
          <KeyCap k="Esc" /><span aria-hidden="true">✕</span>
        </button>
      </header>
      <div className="card-body">{children}</div>
    </div>
  );
}

const fresh = (id: string): QuestState => ({ id, stage: 0, done: false, count: 0, seen: [] });

export function QuestLog() {
  const quests = useGame((s) => s.quests);
  const inv = useGame((s) => s.inventory);
  const merit = useGame((s) => s.merit);
  const rupees = useGame((s) => s.rupees);
  const puppy = useGame((s) => !!s.flags.puppyFollowing);
  const { done, total } = errandCount(quests);
  const items = ITEM_DEFS.filter((d) => (d.id === 'puppy' ? puppy : (inv[d.id] ?? 0) > 0));
  return (
    <Card className="card-log" eyebrow={`Errands · ${done} of ${total} done`} title="Tenzin’s day" bod="ལས་དོན།" label="Errand log"
      onClose={() => G().setPanel(null)}>
      <ul className="errands errands-full">
        {QUESTS.map((d) => <ErrandLine key={d.id} def={d} q={quests[d.id] ?? fresh(d.id)} full />)}
      </ul>
      <h3 className="eyebrow card-sub">Satchel</h3>
      {items.length ? (
        <ul className="satchel-list">
          {items.map((d) => (
            <li key={d.id}>
              <PixelIcon grid={d.grid} size={24} />
              <span><b>{d.name}</b> {d.bod && <span className="bod" lang="bo">{d.bod}</span>}<br /><span className="muted">{d.note}</span></span>
              {(inv[d.id] ?? 0) > 1 ? <span className="satchel-count">×{inv[d.id]}</span> : <span />}
            </li>
          ))}
        </ul>
      ) : <p className="muted small">Nothing yet but a few rupees.</p>}
      <p className="log-foot">
        <span>₹{rupees}</span>
        <span><span className="om" lang="bo">ཨོཾ</span> {merit} turns of the wheel</span>
      </p>
    </Card>
  );
}

export function HelpCard() {
  const touch = useUi((s) => s.touch);
  // a phone has no keyboard worth listing; a touch laptop gets both lists, thumbs first
  const fine = useMedia('(any-pointer: fine)');
  const keyboard = !touch || fine;
  return (
    <Card className="card-help" eyebrow="Controls" title="How to walk" label="Controls" onClose={() => G().setPanel(null)}>
      <div className="help-cols">
        {touch && (
          <section>
            {keyboard && <h3 className="eyebrow help-sub">Touch</h3>}
            <dl className="keys">
              <dt>Left thumb</dt><dd>Walk · push far to run</dd>
              <dt><span className="tglyph" aria-hidden="true">✋</span><span className="sr-only">Hand button</span></dt><dd>Talk · spin · light · buy</dd>
              <dt>Jump</dt><dd>Hop up steps and walls</dd>
              <dt><PixelIcon grid={ROT_L} size={14} /><PixelIcon grid={ROT_R} size={14} /><span className="sr-only">Turn buttons</span></dt><dd>Turn the view 90°</dd>
              <dt>Cam</dt><dd>Iso / chase camera</dd>
              <dt>Right side</dt><dd>Drag to turn · pinch to zoom</dd>
            </dl>
          </section>
        )}
        {keyboard && (
          <section>
            {touch && <h3 className="eyebrow help-sub">Keyboard</h3>}
            <dl className="keys">
              <dt><KeyCap k="W" /><KeyCap k="A" /><KeyCap k="S" /><KeyCap k="D" /></dt><dd>Walk (or arrow keys)</dd>
              <dt><KeyCap k="Shift" /></dt><dd>Run</dd>
              <dt><KeyCap k="Space" /></dt><dd>Jump</dd>
              <dt><KeyCap k="E" /></dt><dd>Talk · spin · light · buy</dd>
              <dt><KeyCap k="Q" /><KeyCap k="R" /></dt><dd>Turn the view 90°</dd>
              <dt><KeyCap k="C" /></dt><dd>Iso / chase camera</dd>
              <dt><KeyCap k="N" /></dt><dd>Day / night</dd>
              <dt><KeyCap k="M" /></dt><dd>Sound on / off</dd>
              <dt><KeyCap k="J" /></dt><dd>Errand log</dd>
              <dt><KeyCap k="Esc" /></dt><dd>Pause</dd>
              <dt>Mouse</dt><dd>Wheel zooms · drag turns</dd>
            </dl>
          </section>
        )}
      </div>
      <p className="muted small help-note">
        Walk the kora and turn the wheels clockwise, keeping the temple on your right. Om mani padme hum.
      </p>
    </Card>
  );
}

export function PauseMenu() {
  const night = useGame((s) => s.night);
  const cam = useGame((s) => s.camera);
  const muted = useGame((s) => s.muted);
  const quests = useGame((s) => s.quests);
  const merit = useGame((s) => s.merit);
  const rupees = useGame((s) => s.rupees);
  const confirm = useUi((s) => s.confirm);
  const { done, total } = errandCount(quests);
  return (
    <div className="card card-pause" role="dialog" aria-modal="true" aria-label="Paused">
      <header className="card-head">
        <div>
          <p className="eyebrow">Little Lhasa · Paused</p>
          <h2 className="card-title"><span className="latin">Rest a while</span><span className="bod" lang="bo">ངལ་གསོ།</span></h2>
          <p className="pause-stats">
            <span>Errands {done}/{total}</span><span>₹{rupees}</span><span><span className="om" lang="bo">ཨོཾ</span> {merit}</span>
          </p>
        </div>
      </header>
      {confirm ? <ConfirmNew /> : (
        <PauseButtons night={night} cam={cam} muted={muted} />
      )}
    </div>
  );
}

/** The pause menu unmounts while one of its cards is open; coming back, focus returns to the button that
 *  opened it (otherwise Resume). */
let reopenFrom: 'quests' | 'help' | null = null;

function PauseButtons({ night, cam, muted }: { night: boolean; cam: 'iso' | 'chase'; muted: boolean }) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = menu.current?.querySelector<HTMLElement>(reopenFrom ? `[data-panel="${reopenFrom}"]` : '.btn-primary');
    el?.focus({ preventScroll: true });
    queueMicrotask(() => { reopenFrom = null; }); // after StrictMode's second effect run, not between
  }, []);
  const open = (p: 'quests' | 'help') => { reopenFrom = p; G().setPanel(p); };
  return (
    <div ref={menu} className="menu" data-nav>
      <button type="button" className="btn btn-primary" onClick={() => G().setPaused(false)}>
        <span className="dot" aria-hidden="true" />Resume <KeyCap k="Esc" />
      </button>
      <button type="button" className="btn" data-panel="quests" onClick={() => open('quests')}>Errands <KeyCap k="J" /></button>
      <button type="button" className="btn" data-panel="help" onClick={() => open('help')}>Controls <KeyCap k="H" /></button>
      <button type="button" className="btn" aria-pressed={night} onClick={() => input.press('night')}>
        Day / Night <span className="menu-val">{night ? 'Night' : 'Day'}</span>
      </button>
      <button type="button" className="btn" onClick={() => input.press('camera')}>
        Camera <span className="menu-val">{cam === 'iso' ? 'Iso' : 'Chase'}</span>
      </button>
      <button type="button" className="btn" aria-pressed={!muted} onClick={() => G().toggleMute()}>
        Sound <span className="menu-val">{muted ? 'Off' : 'On'}</span>
      </button>
      <button type="button" className="btn btn-quiet" onClick={() => useUi.setState({ confirm: true })}>New game…</button>
    </div>
  );
}
