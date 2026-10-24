// Terrain mesh: a 1 m grid over WORLD_BOUNDS, aligned with terrain.ts's height bake so the visible ground
// is exactly where the player's feet are. Chunked into 48 m tiles for frustum culling; tiles that lie wholly
// outside the diorama rim are only shown in the chase camera.
import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Mesh, type Material } from 'three';
import { WORLD_BOUNDS } from '../layout';
import { groundY, groundNormal } from '../terrain';
import { sampleFields } from './fields';

export const CHUNK = 48;
const B = WORLD_BOUNDS;

export interface TerrainChunk { mesh: Mesh; inside: boolean }

export function buildTerrain(material: Material): TerrainChunk[] {
  const out: TerrainChunk[] = [];
  const fs = sampleFields(0, 0);
  for (let cz = B.z0; cz < B.z1; cz += CHUNK) {
    for (let cx = B.x0; cx < B.x1; cx += CHUNK) {
      const x1 = Math.min(cx + CHUNK, B.x1), z1 = Math.min(cz + CHUNK, B.z1);
      const nx = Math.round(x1 - cx), nz = Math.round(z1 - cz);
      const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
      const nor = new Float32Array((nx + 1) * (nz + 1) * 3);
      let maskMax = 0;
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
        const x = cx + i, z = cz + j, k = (j * (nx + 1) + i) * 3;
        pos[k] = x; pos[k + 1] = groundY(x, z); pos[k + 2] = z;
        const n = groundNormal(x, z);
        nor[k] = n[0]; nor[k + 1] = n[1]; nor[k + 2] = n[2];
        maskMax = Math.max(maskMax, sampleFields(x, z, fs).mask);
      }
      const idx = new Uint32Array(nx * nz * 6);
      let q = 0;
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
        // alternate the diagonal so long slopes do not show a ruled grain
        if ((i + j) & 1) { idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d; }
        else { idx[q++] = a; idx[q++] = c; idx[q++] = d; idx[q++] = a; idx[q++] = d; idx[q++] = b; }
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
      g.setIndex(new BufferAttribute(idx, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const mesh = new Mesh(g, material);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.name = 'ground:terrain';
      out.push({ mesh, inside: maskMax > 0.004 });
    }
  }
  return out;
}
