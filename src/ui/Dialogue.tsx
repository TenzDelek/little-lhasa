// Dialogue box: speaker (+ Tibetan name), typewriter text with per-speaker voice blips, ▶ hint, choices on
// the last line. Space / E / Enter / click / tap advance (keys.ts routes the keys here via dialogueCtl).
import { useEffect, useMemo, useRef, useState } from 'react';
import { G, useGame, type Choice } from '../game/store';
import { voiceBlip } from '../audio/synth';
import { dialogueCtl, useUi } from './ctl';
import { KeyCap } from './bits';

const CPS = 52; // characters per second
const PAUSE: Record<string, number> = { '.': 0.16, '!': 0.16, '?': 0.16, '…': 0.22, ',': 0.07, '—': 0.1, ':': 0.08, '།': 0.14 };

const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const graphemes = (s: string) => (seg ? Array.from(seg.segment(s), (x) => x.segment) : Array.from(s));

export function DialogueBox() {
  const d = useGame((s) => s.dialogue);
  const touch = useUi((s) => s.device === 'touch');
  const line = d ? d.lines[Math.min(d.index, d.lines.length - 1)] : null;
  const chars = useMemo(() => (line ? graphemes(line.text) : []), [line]);
  const [n, setN] = useState(0);
  const st = useRef({ n: 0, len: 0 });

  // typewriter
  useEffect(() => {
    st.current.len = chars.length;
    if (!line) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    st.current.n = reduce ? chars.length : 0;
    setN(st.current.n);
    if (reduce) return;
    let raf = 0, last = performance.now(), acc = 0, wait = 0.08, sinceBlip = 3;
    const tick = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (st.current.n >= chars.length) return;
      if (wait > 0) wait -= dt;
      else acc += dt * CPS;
      let k = st.current.n;
      while (acc >= 1 && k < chars.length) {
        acc -= 1;
        const c = chars[k++];
        if (/[\p{L}\p{N}]/u.test(c) && ++sinceBlip >= 3) { sinceBlip = 0; voiceBlip(line.who); }
        const p = PAUSE[c];
        if (p && k < chars.length && /\s/.test(chars[k] ?? ' ')) { wait = p; acc = 0; break; }
      }
      if (k !== st.current.n) { st.current.n = k; setN(k); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [line, chars]);

  // install the advance hook
  useEffect(() => {
    dialogueCtl.advance = () => {
      const dd = G().dialogue;
      if (!dd) return;
      if (st.current.n < st.current.len) { st.current.n = st.current.len; setN(st.current.len); return; }
      const last = dd.index >= dd.lines.length - 1;
      if (last && dd.choices?.length) return;
      G().next();
    };
    return () => { dialogueCtl.advance = () => { G().next(); }; };
  }, []);

  if (!d || !line) return null;
  const last = d.index >= d.lines.length - 1;
  const done = n >= chars.length;
  const choices = last && done && d.choices?.length ? d.choices : null;
  return (
    <div className="dlg-wrap">
      <div className="dlg chip" role="dialog" aria-label={`${line.who} says`} onClick={(e) => {
        if ((e.target as Element).closest('.dlg-choice')) return;
        dialogueCtl.advance();
      }}>
        <p className="dlg-who">
          <span className="eyebrow dlg-name">{line.who}</span>
          {line.bod && <span className="bod" lang="bo">{line.bod}</span>}
          {d.lines.length > 1 && <span className="dlg-page" aria-hidden="true">{d.index + 1}/{d.lines.length}</span>}
        </p>
        <p className="dlg-text" aria-hidden="true">
          <span>{chars.slice(0, n).join('')}</span>
          <span className="ghost">{chars.slice(n).join('')}</span>
        </p>
        <p className="sr-only" aria-live="polite">{line.text}</p>
        {choices ? (
          <Choices choices={choices} />
        ) : (
          <p className={`dlg-next${done ? ' is-ready' : ''}`} aria-hidden="true">
            {touch ? <span className="eyebrow">Tap</span> : <KeyCap k="Space" />}
            <span className="tri" />
          </p>
        )}
      </div>
    </div>
  );
}

function Choices({ choices }: { choices: Choice[] }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus({ preventScroll: true }); }, [choices]);
  return (
    <div className="dlg-choices" data-nav>
      {choices.map((c, i) => (
        <button key={i} ref={i === 0 ? first : undefined} type="button" className="btn dlg-choice" onClick={() => {
          const before = G().dialogue;
          c.run();
          if (G().dialogue === before) G().closeDialogue();
        }}>
          <span className="kc" aria-hidden="true">{i + 1}</span>{c.label}
        </button>
      ))}
    </div>
  );
}
