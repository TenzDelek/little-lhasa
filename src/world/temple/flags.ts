// Lungta strung across the courtyard: from the gilded pavilion down to the roof corners, from the main hall
// to the gate, over the wheel-gallery lane, between the monks' quarters, the Kalachakra temple, the peepal
// tree and the big chorten. (Kora flags are placed in kora.ts.)
import type { V3 } from '../../core/geom';
import type { FlagLine } from '../../kit/flags';
import type { Acc } from './acc';
import { CY } from './site';
import { galleryPostTop as galleryPost } from './gallery';

export function buildCourtFlags(acc: Acc) {
  const roofTop = CY + 9.6 + 0.45;           // main hall parapet top
  const hall = { x0: 3.35, x1: 16.65, z0: 105.85, z1: 123.15 };
  const finial: V3 = [10, CY + 9.6 + 4.6, 115.3];
  const gateW: V3 = [5.1, CY + 4.65, 92.6], gateE: V3 = [12.9, CY + 4.65, 92.6];
  const kalaY = CY + 0.6 + 5.95 + 0.4;
  const kala = { x0: -7.37, x1: -1.83, z0: 105.63, z1: 112.37 };
  const tree: V3 = [-4.0, CY + 6.6, 98.9];
  const blockY3 = CY + 0.3 + 8.4 + 0.5, blockY2 = CY + 0.3 + 5.6 + 0.5;
  const chortenTop: V3 = [-4.6, CY + 4.1, 119.6];
  const lampHouse = { x0: 16.7, x1: 21.3, z0: 97.0, z1: 100.6, y: CY + 3.32 };

  const L: [V3, V3, number?][] = [
    // pavilion finial → roof corners
    [finial, [hall.x0, roofTop, hall.z0]], [finial, [hall.x1, roofTop, hall.z0]],
    [finial, [hall.x0, roofTop, hall.z1]], [finial, [hall.x1, roofTop, hall.z1]],
    // main hall front corners → the gate roof
    [[hall.x0, roofTop, hall.z0], gateW], [[hall.x1, roofTop, hall.z0], gateE],
    [[10, roofTop, hall.z0], [9, CY + 5.6, 92.6]],
    // gate → lamp house → gallery; gate → tree; along the north wall
    [gateE, [lampHouse.x0, lampHouse.y, lampHouse.z0]],
    [[lampHouse.x1, lampHouse.y, lampHouse.z1], galleryPost(0)],
    [gateW, tree],
    [gateW, [-7.0, CY + 1.4, 92.9]], [gateE, [28.8, CY + 1.4, 92.9]],
    // over the wheel-gallery lane
    [[hall.x1, roofTop, 108.5], galleryPost(1)], [[hall.x1, roofTop, 114.5], galleryPost(4)],
    [[hall.x1, roofTop, 120.5], galleryPost(6)],
    // main hall ↔ Kalachakra ↔ tree ↔ NW quarters
    [[hall.x0, roofTop, hall.z0], [kala.x1, kalaY, kala.z0]], [[hall.x0, roofTop, 113.2], [kala.x1, kalaY, kala.z1]],
    [[kala.x0, kalaY, kala.z0], tree], [tree, [-9.9, blockY3, 104.3]], [tree, [-9.9, blockY3, 98.3]],
    [[kala.x0, kalaY, kala.z0], [-9.9, blockY3, 104.3]],
    // south-west plaza: quarters ↔ big chorten ↔ main hall
    [[-9.9, blockY3, 114.1], chortenTop], [[-9.9, blockY3, 126.3], chortenTop],
    [chortenTop, [hall.x0, roofTop, hall.z1]], [chortenTop, [kala.x0 + 0.5, kalaY, kala.z1]],
    [[-7.8, blockY2, 127.5], chortenTop], [[3.0, blockY2, 127.5], [hall.x0, roofTop, hall.z1]],
    // south side
    [[17.7, blockY2, 127.5], [hall.x1, roofTop, hall.z1]], [[26.3, blockY2, 127.5], galleryPost(6)],
    [[3.0, blockY2, 130.9], [10.45, CY + 1.3, 131.2]], [[13.55, CY + 1.3, 131.2], [17.7, blockY2, 130.9]],
  ];
  let seed = 1;
  for (const [a, b, sag] of L) {
    const span = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const line: FlagLine = { a, b, sag: sag ?? span * 0.06, age: ((seed * 37) % 10) / 14, seed: seed * 53 };
    acc.flags.push(line);
    seed++;
  }
}
