// ?colliders=1 — draws every collider as a wire box so collision can be checked in screenshots.
import { useEffect, useState } from 'react';
import { BoxGeometry, CylinderGeometry, EdgesGeometry, LineBasicMaterial, LineSegments, Group } from 'three';
import { collision } from '../core/collision';
import { debug } from '../game/debug';

export function ColliderDebug() {
  const [group] = useState(() => new Group());
  useEffect(() => {
    if (!debug.colliders) return;
    const matBox = new LineBasicMaterial({ color: 0xff2266 });
    const build = () => {
      group.clear();
      for (const c of collision.list()) {
        const geo = c.kind === 'box' ? new BoxGeometry(c.w, c.y1 - c.y0, c.d) : new CylinderGeometry(c.r, c.r, c.y1 - c.y0, 12);
        const l = new LineSegments(new EdgesGeometry(geo), matBox);
        l.position.set(c.x, (c.y0 + c.y1) / 2, c.z);
        if (c.kind === 'box') l.rotation.y = c.rot;
        group.add(l);
      }
    };
    const t = setTimeout(build, 1500);
    return () => clearTimeout(t);
  }, [group]);
  return debug.colliders ? <primitive object={group} /> : null;
}
