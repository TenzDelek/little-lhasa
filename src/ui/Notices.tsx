// Toasts (top centre, by kind) and the interaction prompt (above bottom centre; above the thumb buttons on
// touch, where tapping it interacts).
import { useGame } from '../game/store';
import { input } from '../core/input';
import { useUi } from './ctl';
import { KeyCap } from './bits';

const KIND_LABEL = { quest: 'Errand', merit: 'Merit', money: 'Rupees', info: '' } as const;

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast chip toast-${t.kind}`}>
          {KIND_LABEL[t.kind] && <span className="eyebrow toast-kind">{KIND_LABEL[t.kind]}</span>}
          <span className="toast-text">{t.text}</span>
        </div>
      ))}
    </div>
  );
}

export function Prompt() {
  const prompt = useGame((s) => s.prompt);
  const blocked = useGame((s) => !!s.dialogue || !!s.panel || s.paused || !s.started);
  const device = useUi((s) => s.device);
  const touch = useUi((s) => s.touch);
  if (!prompt || blocked) return null;
  const finger = device === 'touch';
  return (
    <button type="button" className={`prompt chip${touch ? ' is-touch' : ''}`} key={prompt}
      onClick={(e) => { input.press('interact'); if (e.detail) e.currentTarget.blur(); }}
      aria-label={`${prompt} (E)`}>
      {finger ? <span className="prompt-hand" aria-hidden="true">✋</span> : <KeyCap k="E" />}
      <span className="prompt-text">{prompt}</span>
    </button>
  );
}
