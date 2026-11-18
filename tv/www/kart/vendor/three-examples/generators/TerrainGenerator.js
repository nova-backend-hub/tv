import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh
} from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { cameraPosition, color, float, Fn, If, mix, mx_noise_float, normalView, normalWorld, positionView, positionWorld, saturation, smoothstep, uniform } from "three/tsl";
import { ImprovedNoise } from "../math/ImprovedNoise.js";
class TerrainGenerator {
  constructor(parameters = {}) {
    this.parameters = Object.assign({}, TerrainGenerator.defaults, parameters);
    this.minHeight = uniform(0);
    this.maxHeight = uniform(1);
    this.material = terrainMaterial(this.minHeight, this.maxHeight);
    this.geometry = null;
    this.group = null;
  }
  build() {
    this.dispose();
    const p = this.parameters;
    const N = p.segments + 1;
    const half = p.size / 2;
    const coord = new Array(N);
    for (let i = 0; i < N; i++) coord[i] = i / p.segments * p.size - half;
    const height = heightField(p);
    const heights = new Float32Array(N * N);
    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        heights[iz * N + ix] = height(coord[ix], coord[iz]);
      }
    }
    if (p.talusPasses > 0) thermalErode(heights, N, p.size / p.segments, p.talus, p.talusPasses);
    const positions = new Float32Array(N * N * 3);
    let min = Infinity, max = -Infinity;
    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        const o = iz * N + ix;
        const y = heights[o];
        positions[o * 3] = coord[ix];
        positions[o * 3 + 1] = y;
        positions[o * 3 + 2] = coord[iz];
        if (y < min) min = y;
        if (y > max) max = y;
      }
    }
    const indices = [];
    for (let iz = 0; iz < p.segments; iz++) {
      for (let ix = 0; ix < p.segments; ix++) {
        const a = iz * N + ix, b = a + 1, c = a + N, d = c + 1;
        if ((ix + iz) % 2 === 0) indices.push(a, c, b, b, c, d);
        else indices.push(a, c, d, a, d, b);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    this.heights = heights;
    this.gridSize = N;
    this.minY = min;
    this.maxY = max;
    this.minHeight.value = min;
    this.maxHeight.value = max;
    const mesh = new Mesh(geometry, this.material);
    mesh.castShadow = mesh.receiveShadow = true;
    const group = new Group();
    group.name = "Terrain";
    group.add(mesh);
    this.geometry = geometry;
    this.group = group;
    return group;
  }
  // world-space height at ( x, z ), bilinearly interpolated from the baked grid
  sampleHeight(x, z) {
    const p = this.parameters;
    const N = this.gridSize;
    const half = p.size / 2;
    const fx = Math.max(0, Math.min(p.segments, (x + half) / p.size * p.segments));
    const fz = Math.max(0, Math.min(p.segments, (z + half) / p.size * p.segments));
    const ix = Math.min(N - 2, Math.floor(fx));
    const iz = Math.min(N - 2, Math.floor(fz));
    const tx = fx - ix;
    const tz = fz - iz;
    const h = this.heights;
    const h00 = h[iz * N + ix];
    const h10 = h[iz * N + ix + 1];
    const h01 = h[(iz + 1) * N + ix];
    const h11 = h[(iz + 1) * N + ix + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }
  // surface flatness at ( x, z ): the normal's y component ( 1 on the flat, → 0 on a
  // cliff ). allocation-free, for cheaply testing many candidate forest positions.
  sampleSlope(x, z) {
    const e = this.parameters.size / this.parameters.segments;
    const hx = this.sampleHeight(x + e, z) - this.sampleHeight(x - e, z);
    const hz = this.sampleHeight(x, z + e) - this.sampleHeight(x, z - e);
    return 2 * e / Math.sqrt(hx * hx + 4 * e * e + hz * hz);
  }
  dispose() {
    if (this.geometry) this.geometry.dispose();
    this.geometry = null;
    this.group = null;
  }
}
TerrainGenerator.defaults = {
  seed: 1,
  size: 200,
  // world units across the square patch
  segments: 192,
  // grid quads per side; vertices = ( segments + 1 )²
  heightScale: 65,
  // peak-to-valley exaggeration, in world units
  frequency: 0.01,
  // base noise frequency ( the footprint of a mountain )
  octaves: 5,
  lacunarity: 1.97,
  // per-octave frequency step; off 2 so octaves don't grid-lock
  gain: 0.5,
  // per-octave amplitude step ( persistence )
  erosion: 0.7,
  // derivative damping: higher flattens valleys and sharpens ridges
  warp: 0.35,
  // domain-warp strength ( noise units ): bends ridges and valleys
  valleyBias: 1.2,
  // power curve over the height, to flatten the mist floor
  seaLevel: 0.15,
  // 0..1, subtracted before scaling so the valley floor sinks below y = 0
  talus: 1,
  // thermal-erosion angle of repose ( rise / run ): lower settles flatter
  talusPasses: 12
  // thermal-erosion iterations ( 0 = off )
};
function createRandom(seed) {
  let s = seed >>> 0 || 1;
  return function() {
    s = s + 1831565813 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function heightField(p) {
  const perlin = new ImprovedNoise();
  const random = createRandom(p.seed);
  const offsetX = random() * 256;
  const offsetZ = random() * 256;
  const slice = random() * 256;
  const { frequency, octaves, lacunarity, gain, erosion, warp, valleyBias, seaLevel, heightScale } = p;
  function warpField(x, z, zr) {
    let freq = 1, amp = 1, sum = 0, norm = 0;
    for (let i = 0; i < 2; i++) {
      sum += amp * perlin.noise(x * freq + offsetX, z * freq + offsetZ, zr + i * 1.7);
      norm += amp;
      freq *= lacunarity;
      amp *= gain;
    }
    return sum / norm;
  }
  function eroded(x, z) {
    let sum = 0, amp = 1, dX = 0, dZ = 0, px = x, pz = z, freq = 1;
    const e = 4e-3;
    for (let i = 0; i < octaves; i++) {
      const zr = slice + i * 1.7;
      const bx = px * freq + offsetX, bz = pz * freq + offsetZ;
      const n = perlin.noise(bx, bz, zr);
      const nx = perlin.noise(bx + e, bz, zr);
      const nz = perlin.noise(bx, bz + e, zr);
      dX += (nx - n) / e * freq;
      dZ += (nz - n) / e * freq;
      sum += amp * n / (1 + erosion * (dX * dX + dZ * dZ));
      const rx = 0.8 * px - 0.6 * pz;
      pz = 0.6 * px + 0.8 * pz;
      px = rx;
      freq *= lacunarity;
      amp *= gain;
    }
    return sum * 0.5 + 0.5;
  }
  return function(worldX, worldZ) {
    const x = worldX * frequency, z = worldZ * frequency;
    const wx = x + warp * warpField(x + 1.3, z + 7.2, slice + 40);
    const wz = z + warp * warpField(x + 5.2, z + 1.3, slice + 70);
    const h = Math.pow(Math.min(eroded(wx, wz) * 1.1, 1), valleyBias);
    return (h - seaLevel) * heightScale;
  };
}
function thermalErode(h, N, cellSize, talus, passes) {
  const drop = talus * cellSize;
  const carry = 0.5;
  const delta = new Float32Array(N * N);
  const ex = [0, 0, 0, 0];
  const off = [-1, 1, -N, N];
  for (let p = 0; p < passes; p++) {
    delta.fill(0);
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = z * N + x;
        const hi = h[i];
        ex[0] = x > 0 ? hi - h[i - 1] - drop : 0;
        ex[1] = x < N - 1 ? hi - h[i + 1] - drop : 0;
        ex[2] = z > 0 ? hi - h[i - N] - drop : 0;
        ex[3] = z < N - 1 ? hi - h[i + N] - drop : 0;
        let sum = 0, peak = 0;
        for (let k = 0; k < 4; k++) {
          const d = ex[k];
          if (d <= 0) {
            ex[k] = 0;
            continue;
          }
          sum += d;
          if (d > peak) peak = d;
        }
        if (sum <= 0) continue;
        const move = carry * peak;
        delta[i] -= move;
        for (let k = 0; k < 4; k++) {
          if (ex[k] > 0) delta[i + off[k]] += move * ex[k] / sum;
        }
      }
    }
    for (let k = 0; k < N * N; k++) h[k] += delta[k];
  }
}
function bumpNormal(height) {
  const dpdx = positionView.dFdx();
  const dpdy = positionView.dFdy();
  const r1 = dpdy.cross(normalView);
  const r2 = normalView.cross(dpdx);
  const det = dpdx.dot(r1);
  const grad = det.sign().mul(height.dFdx().mul(r1).add(height.dFdy().mul(r2)));
  return det.abs().mul(normalView).sub(grad).normalize();
}
function terrainMaterial(minHeight, maxHeight) {
  const material = new MeshStandardNodeMaterial();
  material.metalness = 0;
  const distance = positionWorld.distance(cameraPosition);
  const altitude = positionWorld.y.sub(minHeight).div(maxHeight.sub(minHeight)).clamp();
  const flatness = normalWorld.y.clamp();
  const steep = flatness.oneMinus();
  const detail = mx_noise_float(positionWorld.xz.mul(0.05));
  const grain = mx_noise_float(positionWorld.xz.mul(0.18));
  const macro = mx_noise_float(positionWorld.xz.mul(0.012));
  const grass = color(7238227);
  const dryGrass = color(9078096);
  const forest = color(3751983);
  const rock = color(7563871);
  const scree = color(8616559);
  const lichen = color(7107413);
  const snow = color(15330544);
  const snowDeep = color(13424354);
  const bandA = positionWorld.y.mul(0.5).add(detail.mul(3)).add(macro.mul(4)).sin();
  const bandB = positionWorld.y.mul(1.4).add(grain.mul(2)).sin();
  const strata = bandA.mul(0.6).add(bandB.mul(0.4)).mul(0.5).add(0.5);
  const lichenMask = smoothstep(0.45, 0.72, grain).mul(smoothstep(0.62, 0.32, steep)).mul(smoothstep(0.66, 0.34, altitude));
  const rockShade = mix(rock, lichen, lichenMask.mul(0.45)).mul(strata.mul(0.36).add(0.8));
  let surface = mix(grass, dryGrass, smoothstep(0.15, 0.75, macro).mul(smoothstep(0.22, 0.5, altitude)));
  surface = mix(surface, forest, smoothstep(0.16, 0.34, altitude).mul(smoothstep(0.5, 0.72, flatness)).mul(0.75));
  surface = mix(surface, rockShade, smoothstep(0.46, 0.64, altitude.add(detail.mul(0.06))));
  surface = mix(surface, rockShade, smoothstep(0.34, 0.62, steep));
  const screeMask = smoothstep(0.42, 0.7, steep).mul(smoothstep(0.35, 0.7, flatness)).mul(detail.mul(0.5).add(0.5));
  surface = mix(surface, scree, screeMask.mul(0.5));
  const snowMask = smoothstep(0.56, 0.78, altitude.add(detail.mul(0.08)).add(grain.mul(0.05))).mul(smoothstep(0.3, 0.6, flatness));
  const snowColor = mix(snow, snowDeep, smoothstep(0.2, 0.7, grain).mul(0.6));
  surface = mix(surface, snowColor, snowMask);
  const cavity = smoothstep(0.24, 0.06, altitude).mul(flatness);
  surface = surface.mul(cavity.mul(0.32).oneMinus());
  surface = surface.mul(macro.mul(0.5).add(0.5).mul(0.3).add(0.84));
  surface = surface.mul(grain.mul(0.5).add(0.5).mul(0.12).add(0.94));
  const aerial = smoothstep(180, 820, distance);
  surface = saturation(surface, aerial.oneMinus().mul(0.5).add(0.5));
  surface = mix(surface, color(13617338), aerial.mul(0.62));
  material.colorNode = surface;
  material.roughnessNode = mix(float(0.95), float(0.72), snowMask);
  const detailFade = smoothstep(420, 60, distance);
  const reliefStrength = mix(float(0.25), float(0.55), steep);
  const relief = Fn(() => {
    const r = float(0).toVar();
    If(detailFade.greaterThan(0.01), () => {
      r.assign(mx_noise_float(positionWorld.xz.mul(0.6)).add(mx_noise_float(positionWorld.xz.mul(1.7)).mul(0.5)).add(mx_noise_float(positionWorld.xz.mul(4)).mul(0.25)).mul(reliefStrength).mul(detailFade).mul(0.25));
    });
    return r;
  })();
  material.normalNode = bumpNormal(relief);
  return material;
}
export { TerrainGenerator };
