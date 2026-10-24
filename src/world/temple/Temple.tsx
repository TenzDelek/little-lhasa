// Tsuglagkhang complex (main temple of McLeod Ganj) and the Lingkhor kora around it.
// Static geometry is merged per area into a handful of meshes; interactive pieces (prayer wheels, butter
// lamps) and animated ones (incense smoke, tree) are their own components.
import { useEffect, useMemo } from 'react';
import { collision } from '../../core/collision';
import { lamps } from '../../core/lamps';
import { partsMaterial } from '../../core/materials';
import { Acc } from './acc';
import { buildEnclosure } from './enclosure';
import { buildMainHall } from './mainHall';
import { buildGate } from './gate';
import { buildKalachakra } from './kalachakra';
import { buildGallery } from './gallery';
import { buildLampHouse } from './lampHouse';
import { PrayerWheels } from './Wheels';
import { ButterLamps } from './ButterLamps';
import { buildQuarters } from './quarters';
import { buildDressing } from './dressing';
import { buildKora } from './kora';
import { buildCourtFlags } from './flags';
import { BodhiTree } from './Tree';
import { Smoke } from './Smoke';
import { PrayerFlags, Darchor } from '../../kit/flags';

function build() {
  const acc = new Acc(108);
  buildEnclosure(acc);
  buildMainHall(acc);
  buildGate(acc);
  buildKalachakra(acc);
  buildGallery(acc);
  buildLampHouse(acc);
  buildQuarters(acc);
  buildDressing(acc);
  buildKora(acc);
  buildCourtFlags(acc);
  const meshes = [
    ...acc.big.toMeshes(partsMaterial({ occlude: true, key: 'temple-big' }), 24, true),
    ...acc.small.toMeshes(partsMaterial({ key: 'temple-small' }), 32, true),
    ...acc.fine.toMeshes(partsMaterial({ key: 'temple-fine' }), 64, false),
    ...acc.deck.toMeshes(partsMaterial({ key: 'temple-deck', grain: 0.04 }), 48, false),
  ];
  return { acc, meshes };
}

export function Temple() {
  const { acc, meshes } = useMemo(() => build(), []);

  useEffect(() => {
    const offs = [
      ...acc.colliders.map((b) => collision.addBox(b)),
      ...acc.circles.map((c) => collision.addCircle(c)),
      ...acc.lamps.map((l) => lamps.add(l)),
    ];
    return () => { for (const off of offs) off(); };
  }, [acc]);

  return (
    <>
      {meshes.map((m, i) => <primitive key={i} object={m} />)}
      {acc.meshes.map((m, i) => <primitive key={`x${i}`} object={m} />)}
      <PrayerWheels wheels={acc.wheels} />
      <ButterLamps spots={acc.butterLamps} />
      <BodhiTree />
      {acc.smoke.length > 0 && <Smoke sources={acc.smoke} />}
      {acc.flags.length > 0 && <PrayerFlags lines={acc.flags} />}
      {acc.poles.length > 0 && <Darchor poles={acc.poles} />}
    </>
  );
}
