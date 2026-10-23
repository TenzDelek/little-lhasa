// Everything that makes up the town. Each module owns its folder and mounts here inside its own error
// boundary, so a crash in one module only removes that module.
import { Component, type ReactNode } from 'react';
import { Ground } from './ground/Ground';
import { MainSquare } from './square/MainSquare';
import { Market } from './market/Market';
import { Temple } from './temple/Temple';
import { Hillside } from './hillside/Hillside';
import { Props } from './props/Props';
import { Npcs } from '../characters/npcs/Npcs';
import { Animals } from '../characters/animals/Animals';
import { ColliderDebug } from './ColliderDebug';
import { KitPreview } from '../kit/KitPreview';
import { debug } from '../game/debug';

class Guard extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.error(`[world] module "${this.props.name}" crashed:`, e); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function World() {
  return (
    <>
      <Guard name="ground"><Ground /></Guard>
      <Guard name="square"><MainSquare /></Guard>
      <Guard name="market"><Market /></Guard>
      <Guard name="temple"><Temple /></Guard>
      <Guard name="hillside"><Hillside /></Guard>
      <Guard name="props"><Props /></Guard>
      <Guard name="npcs"><Npcs /></Guard>
      <Guard name="animals"><Animals /></Guard>
      {debug.kit && <Guard name="kit"><KitPreview /></Guard>}
      <ColliderDebug />
    </>
  );
}
