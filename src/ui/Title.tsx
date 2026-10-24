// Title screen: the live town turns slowly behind a paper caption (Gorshey's layout), Begin / Continue,
// and a compact controls card. Enter / Space / tap begins (see keys.ts).
import { useEffect, useRef, useState } from 'react';
import { G, useGame } from '../game/store';
import { begin, hasProgress, newGame, useUi } from './ctl';
import { KeyCap } from './bits';

export function Title() {
  const started = useGame((s) => s.started);
  const saved = useGame(hasProgress);
  const touch = useUi((s) => s.touch);
  const confirm = useUi((s) => s.confirm);
  // stay mounted for the fade-out after Begin
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    let t = 0;
    const unsub = useGame.subscribe((s, p) => {
      if (s.started === p.started) return;
      clearTimeout(t);
      setLeaving(s.started);
      if (s.started) t = window.setTimeout(() => setLeaving(false), 700);
    });
    return () => { unsub(); clearTimeout(t); };
  }, []);
  const shown = !started || leaving;
  const beginRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // keyboard players can just press Enter; on touch screens a focus ring would only be noise
    if (shown && !started && !confirm && !touch) beginRef.current?.focus({ preventScroll: true });
  }, [shown, started, confirm, touch]);

  if (!shown) return null;
  return (
    <section className={`title${started ? ' is-leaving' : ''}`} aria-label="Title screen" data-nav
      onClick={(e) => { if (!confirm && !(e.target as Element).closest('button, .confirm, .title-card')) begin(); }}>
      <div className="title-wash" aria-hidden="true" />
      <div className="title-main">
        <p className="eyebrow">A walk through McLeod Ganj</p>
        <h1 className="title-name">
          <span className="latin">Little Lhasa</span>
          <span className="bod" lang="bo">ལྷ་ས་ཆུང་ཆུང་།</span>
        </h1>
        <p className="title-note">
          Tenzin has errands to run before the evening prayers: momos for Amala, butter lamps at the temple, the
          wheels to turn, and a lost puppy somewhere up Bhagsu Road.
        </p>
        {!confirm ? (
          <div className="title-actions">
            <button ref={beginRef} type="button" className="btn btn-primary" onClick={begin}>
              <span className="dot" aria-hidden="true" />{saved ? 'Continue' : 'Begin'}
            </button>
            {saved && (
              <button type="button" className="btn btn-quiet" onClick={() => useUi.setState({ confirm: true })}>New game</button>
            )}
            <span className="title-hint" aria-hidden="true">
              {touch ? (saved ? 'Tap to continue' : 'Tap to begin') : <>Press <KeyCap k="Enter" /></>}
            </span>
          </div>
        ) : (
          <ConfirmNew onDone={() => { G().start(); }} />
        )}
      </div>
      <aside className="title-card" aria-label="Controls">
        <p className="eyebrow">How to play</p>
        {touch ? (
          <dl className="keys">
            <dt>Left thumb</dt><dd>Walk · push far to run</dd>
            <dt>✋</dt><dd>Talk, spin, light, buy</dd>
            <dt>Jump</dt><dd>Hop up steps and walls</dd>
            <dt>Right side</dt><dd>Drag to turn the view</dd>
          </dl>
        ) : (
          <dl className="keys">
            <dt><KeyCap k="W" /><KeyCap k="A" /><KeyCap k="S" /><KeyCap k="D" /></dt><dd>Walk · <KeyCap k="Shift" /> run</dd>
            <dt><KeyCap k="E" /></dt><dd>Talk, spin, light, buy</dd>
            <dt><KeyCap k="Space" /></dt><dd>Jump</dd>
            <dt><KeyCap k="Q" /><KeyCap k="R" /></dt><dd>Turn the view</dd>
            <dt><KeyCap k="C" /> <KeyCap k="N" /></dt><dd>Camera · day / night</dd>
            <dt><KeyCap k="J" /> <KeyCap k="Esc" /></dt><dd>Errands · pause</dd>
          </dl>
        )}
      </aside>
    </section>
  );
}

/** "Start over?" — used on the title (Continue → New game) and in the pause menu. */
export function ConfirmNew({ onDone }: { onDone?: () => void }) {
  const no = useRef<HTMLButtonElement>(null);
  useEffect(() => { no.current?.focus({ preventScroll: true }); }, []);
  return (
    <div className="confirm" role="alertdialog" aria-label="Start a new game?" data-nav>
      <p className="confirm-q">Start a new day? Your errands, rupees and merit will be cleared.</p>
      <div className="confirm-actions">
        <button ref={no} type="button" className="btn" onClick={() => useUi.setState({ confirm: false })}>Cancel</button>
        <button type="button" className="btn btn-danger" onClick={() => { newGame(); onDone?.(); }}>Start over</button>
      </div>
    </div>
  );
}
