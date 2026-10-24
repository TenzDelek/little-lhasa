// Bottom-right Gorshey-style buttons: DAY / NIGHT, CAMERA, SOUND, PAUSE. On touch screens only a compact
// pause button stays (top-right); the rest live in the pause menu and the thumb cluster.
import type { MouseEvent } from 'react';
import { G, useGame } from '../game/store';
import { input } from '../core/input';
import { DayGlyph, KeyCap } from './bits';

/** Mouse clicks shouldn't leave focus on the button (Space would press it again instead of jumping). */
const blurIfPointer = (e: MouseEvent<HTMLButtonElement>) => { if (e.detail) e.currentTarget.blur(); };

export function Dock() {
  const night = useGame((s) => s.night);
  const cam = useGame((s) => s.camera);
  const muted = useGame((s) => s.muted);
  return (
    <nav className="dock" aria-label="Game controls">
      <button type="button" className="btn" aria-pressed={night} title="Day / night (N)" aria-label="Day / night"
        onClick={(e) => { input.press('night'); blurIfPointer(e); }}>
        <DayGlyph night={night} />
        <span><span className={night ? 'btn-off' : undefined}>Day</span><span className="btn-off"> / </span><span className={night ? undefined : 'btn-off'}>Night</span></span>
      </button>
      <button type="button" className="btn" title="Camera (C)" aria-label={`Camera: ${cam}`} onClick={(e) => { input.press('camera'); blurIfPointer(e); }}>
        <span className="dot" aria-hidden="true" /><span className="btn-word">Camera</span><span className="btn-val">{cam === 'iso' ? 'Iso' : 'Chase'}</span>
      </button>
      <button type="button" className="btn" aria-pressed={!muted} title="Sound (M)" aria-label="Sound" onClick={(e) => { G().toggleMute(); blurIfPointer(e); }}>
        <SoundGlyph muted={muted} /><span className="btn-word">Sound</span><span className="btn-val">{muted ? 'Off' : 'On'}</span>
      </button>
      <button type="button" className="btn" title="Pause (Esc)" aria-label="Pause" onClick={(e) => { G().setPaused(true); blurIfPointer(e); }}>
        <PauseGlyph /><span className="btn-word">Pause</span>
      </button>
    </nav>
  );
}

export function KeyHints() {
  return (
    <p className="keyhints chip" aria-hidden="true">
      <span><KeyCap k="E" /> use</span>
      <span><KeyCap k="J" /> errands</span>
      <span><KeyCap k="H" /> help</span>
    </p>
  );
}

/** Touch: a small pause button and a sound toggle in the top-right corner. */
export function CornerButtons() {
  const muted = useGame((s) => s.muted);
  return (
    <div className="corner">
      <button type="button" className="btn btn-icon" aria-label={muted ? 'Sound off' : 'Sound on'} aria-pressed={!muted}
        onClick={() => G().toggleMute()}>
        <SoundGlyph muted={muted} />
      </button>
      <button type="button" className="btn btn-icon" aria-label="Pause" onClick={() => G().setPaused(true)}>
        <PauseGlyph />
      </button>
    </div>
  );
}

function PauseGlyph() {
  return (
    <svg className="glyph" width="12" height="12" viewBox="0 0 6 6" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="1" y="1" width="1" height="4" fill="currentColor" /><rect x="4" y="1" width="1" height="4" fill="currentColor" />
    </svg>
  );
}

function SoundGlyph({ muted }: { muted: boolean }) {
  return (
    <svg className="glyph" width="14" height="12" viewBox="0 0 7 6" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="0" y="2" width="1" height="2" fill="currentColor" />
      <rect x="1" y="1" width="1" height="4" fill="currentColor" />
      <rect x="2" y="0" width="1" height="6" fill="currentColor" />
      {muted ? (
        <><rect x="4" y="2" width="1" height="1" fill="currentColor" /><rect x="6" y="2" width="1" height="1" fill="currentColor" />
          <rect x="5" y="3" width="1" height="1" fill="currentColor" /><rect x="4" y="4" width="1" height="1" fill="currentColor" />
          <rect x="6" y="4" width="1" height="1" fill="currentColor" /></>
      ) : (
        <><rect x="4" y="2" width="1" height="2" fill="currentColor" /><rect x="5" y="1" width="1" height="1" fill="currentColor" />
          <rect x="5" y="4" width="1" height="1" fill="currentColor" /><rect x="6" y="2" width="1" height="2" fill="currentColor" /></>
      )}
    </svg>
  );
}

