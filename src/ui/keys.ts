// Keyboard routing for the HTML UI. Runs in the CAPTURE phase on window, i.e. before core/input.ts (which
// listens in the bubble phase), so a key the UI uses never also reaches the game:
//   title     Enter / Space begin; only N (day/night) and M (mute) pass through
//   dialogue  Space / E / F / Enter advance (finish the typewriter first); 1-9 pick a choice; ↑↓ move focus
//   menus     Space / Enter click the focused button; ↑↓ move between buttons; Esc closes the confirm
//   play      a focused HUD button gets Space / Enter, not the boy
// Esc / P / J / H / N / C / M otherwise go through to the game, whose GameSystems handles them.
import { useEffect } from 'react';
import { G } from '../game/store';
import { begin, dialogueCtl, setDevice, useUi } from './ctl';

const ADVANCE = new Set(['Space', 'Enter', 'NumpadEnter', 'KeyE', 'KeyF']);
const TITLE_PASS = new Set(['KeyN', 'KeyM']);

function hudButton(): HTMLElement | null {
  const a = document.activeElement as HTMLElement | null;
  return a && a !== document.body && a.closest('.hud') && (a.tagName === 'BUTTON' || a.getAttribute('role') === 'button') ? a : null;
}

/** Move focus among the buttons of the top-most open card. */
function moveFocus(dir: 1 | -1) {
  const layers = document.querySelectorAll<HTMLElement>('.hud [data-nav]');
  const layer = layers[layers.length - 1];
  if (!layer) return false;
  const btns = [...layer.querySelectorAll<HTMLButtonElement>('button:not([disabled])')].filter((b) => b.offsetParent !== null);
  if (!btns.length) return false;
  const i = btns.indexOf(document.activeElement as HTMLButtonElement);
  btns[(i + dir + btns.length) % btns.length].focus();
  return true;
}

export function useKeyRouter(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const down = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) { e.stopPropagation(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      setDevice('kbd');
      const s = G();
      const code = e.code;
      const btn = hudButton();
      const stop = () => { e.stopPropagation(); };
      const swallow = () => { e.preventDefault(); e.stopPropagation(); };

      // New-game confirmation: Esc cancels it (and nothing else happens)
      if (useUi.getState().confirm && code === 'Escape') { useUi.setState({ confirm: false }); swallow(); return; }

      // title screen
      if (!s.started) {
        if (TITLE_PASS.has(code)) return;
        if (code === 'ArrowDown' || code === 'ArrowUp') { if (moveFocus(code === 'ArrowDown' ? 1 : -1)) swallow(); else stop(); return; }
        if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') {
          if (btn) { stop(); return; } // the focused button clicks itself
          if (!e.repeat && !useUi.getState().confirm) begin();
          swallow();
          return;
        }
        if (code === 'Tab') return;
        stop();
        return;
      }

      // pause menu or a panel on top: the keyboard drives the cards
      if (s.paused || s.panel) {
        if (code === 'ArrowDown' || code === 'ArrowUp') { if (moveFocus(code === 'ArrowDown' ? 1 : -1)) swallow(); return; }
        if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') { if (btn) stop(); else swallow(); return; }
        if (code === 'KeyE' || code === 'KeyF') { swallow(); return; }
        return;
      }

      // dialogue
      if (s.dialogue) {
        const d = s.dialogue;
        const last = d.index >= d.lines.length - 1;
        const choices = last && d.choices?.length ? d.choices : null;
        if (choices) {
          const n = Number(code.replace(/^(Digit|Numpad)/, ''));
          if (/^(Digit|Numpad)\d$/.test(code) && n >= 1 && n <= choices.length) {
            swallow();
            document.querySelectorAll<HTMLButtonElement>('.hud .dlg-choice')[n - 1]?.click();
            return;
          }
          if (code === 'ArrowDown' || code === 'ArrowUp' || code === 'ArrowLeft' || code === 'ArrowRight') {
            if (moveFocus(code === 'ArrowDown' || code === 'ArrowRight' ? 1 : -1)) swallow();
            return;
          }
        }
        if (ADVANCE.has(code)) {
          if (btn && (code === 'Space' || code === 'Enter' || code === 'NumpadEnter')) { stop(); return; }
          swallow();
          if (!e.repeat) dialogueCtl.advance();
          return;
        }
        return;
      }

      // playing: a focused HUD button keeps Space / Enter to itself
      if (btn && (code === 'Space' || code === 'Enter' || code === 'NumpadEnter')) stop();
    };
    window.addEventListener('keydown', down, { capture: true });
    return () => window.removeEventListener('keydown', down, { capture: true });
  }, [enabled]);
}
