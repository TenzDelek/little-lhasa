import { useGame } from '../game/store';
import { debug } from '../game/debug';
export function Hud() {
  const started = useGame((s) => s.started);
  const start = useGame((s) => s.start);
  if (debug.shot) return null;
  return started ? null : <button style={{ position: 'absolute', bottom: 20, left: 20 }} onClick={start}>Start</button>;
}
