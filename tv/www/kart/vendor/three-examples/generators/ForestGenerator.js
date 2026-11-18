import {
  BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  Vector3
} from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { attribute, color, float, Fn, If, mix, mx_noise_float, normalView, positionLocal, positionView, positionWorld, smoothstep, step, uniform } from "three/tsl";
import { ImprovedNoise } from "../math/ImprovedNoise.js";
import { mergeVertices } from "../utils/BufferGeometryUtils.js";
class ForestGenerator {
  constructor(parameters = {}) {
    this.parameters = Object.assign({}, ForestGenerator.defaults, parameters);
    this.from = uniform(this.parameters.from);
    this.to = uniform(this.parameters.to);
    this._cameraPosition = uniform(new Vector3());
    this.material = createForestMaterial(this.from, this.to, this._cameraPosition);
    this.mesh = null;
    this.group = null;
  }
  build(terrain) {
    this.dispose();
    const p = this.parameters;
    const geometry = blobGeometry(p);
    const size = terrain.parameters.size;
    const minY = terrain.minY;
    const span = terrain.maxY - terrain.minY;
    const random = createRandom(p.seed);
    const perlin = new ImprovedNoise();
    const dOffX = random() * 256, dOffZ = random() * 256, dSlice = random() * 256;
    const densityAt = (x, z) => smoothBlend(-0.12, 0.22, perlin.noise(x * p.densityFrequency + dOffX, z * p.densityFrequency + dOffZ, dSlice));
    const mesh = new InstancedMesh(geometry, this.material, p.count);
    mesh.castShadow = mesh.receiveShadow = p.castShadow;
    const cullData = new Float32Array(p.count * 4);
    const cullRandom = createRandom((p.seed ^ 2654435769) >>> 0);
    const regionData = new Float32Array(p.count);
    const rOffX = cullRandom() * 256, rOffZ = cullRandom() * 256, rSlice = cullRandom() * 256;
    const dummy = new Object3D();
    let placed = 0;
    let attempts = 0;
    const maxAttempts = p.count * 14;
    while (placed < p.count && attempts < maxAttempts) {
      attempts++;
      const x = (random() - 0.5) * size;
      const z = (random() - 0.5) * size;
      const y = terrain.sampleHeight(x, z);
      const altitude = (y - minY) / span;
      if (altitude < p.altitudeMin || altitude > p.altitudeMax) continue;
      if (terrain.sampleSlope(x, z) < p.minSlope) continue;
      let density = densityAt(x, z);
      density *= smoothBlend(p.altitudeMax, p.altitudeMax - 0.14, altitude);
      if (random() >= density) continue;
      dummy.position.set(x, y - p.sink, z);
      dummy.rotation.set((random() - 0.5) * 0.12, random() * Math.PI * 2, (random() - 0.5) * 0.12);
      const s = p.minScale + random() * random() * (p.maxScale - p.minScale);
      dummy.scale.set(s * (0.85 + random() * 0.3), s, s * (0.85 + random() * 0.3));
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      const c = placed * 4;
      cullData[c] = x;
      cullData[c + 1] = dummy.position.y;
      cullData[c + 2] = z;
      cullData[c + 3] = cullRandom();
      regionData[placed] = Math.min(1, Math.max(0, perlin.noise(x * 0.02 + rOffX, z * 0.02 + rOffZ, rSlice) * 0.6 + 0.5));
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    geometry.setAttribute("cull", new InstancedBufferAttribute(cullData, 4));
    geometry.setAttribute("region", new InstancedBufferAttribute(regionData, 1));
    const group = new Group();
    group.name = "Forest";
    group.add(mesh);
    this.mesh = mesh;
    this.group = group;
    return group;
  }
  // call each frame so the distance cull tracks the camera
  setCameraPosition(position) {
    this._cameraPosition.value.copy(position);
  }
  dispose() {
    if (this.mesh) this.mesh.geometry.dispose();
    this.mesh = null;
    this.group = null;
  }
}
ForestGenerator.defaults = {
  seed: 1,
  count: 5e5,
  // number of trees to plant ( a single instanced draw call )
  detail: 0,
  // icosphere subdivision ( 0 = 20 faces, welds to 12 verts )
  radius: 1.3,
  // base half-width of a tree blob, in world units
  height: 4,
  // base height of a tree blob
  distortion: 0.5,
  // lumpiness of the blob hull ( a rough conifer, not a smooth egg )
  sink: 0.4,
  // how far the base point is pushed under the surface, to hide it
  altitudeMin: 0.12,
  // normalised altitude band the forest occupies: above the mist floor...
  altitudeMax: 0.46,
  // ...and safely below the snowline
  minSlope: 0.55,
  // minimum surface flatness ( normal.y ); steeper ground stays bare rock
  densityFrequency: 0.012,
  // patch / clearing scale ( world units )
  minScale: 0.7,
  maxScale: 1.8,
  from: 300,
  // distance ( like THREE.Fog ) within which every tree is drawn...
  to: 620,
  // ...past which none are; the band between thins out stochastically
  castShadow: false
  // whether the canopy casts + receives shadows ( 500k casters is a real cost — opt in )
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
function smoothBlend(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
function blobNoise(x, y, z) {
  return Math.sin(x * 3.1) * Math.sin(y * 2.7 + 1.3) * Math.sin(z * 3.5 + 2.1);
}
function blobGeometry(p) {
  let geometry = new IcosahedronGeometry(1, p.detail);
  geometry.deleteAttribute("uv");
  geometry.deleteAttribute("normal");
  geometry = mergeVertices(geometry);
  const position = geometry.attributes.position;
  const count = position.count;
  const normals = new Float32Array(count * 3);
  const ao = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const ux = position.getX(i);
    const uy = position.getY(i);
    const uz = position.getZ(i);
    const h = (uy + 1) / 2;
    const taper = 1 - 0.62 * h;
    const lump = 1 + p.distortion * blobNoise(ux, uy, uz);
    const r = taper * lump;
    position.setXYZ(i, ux * r * p.radius, h * p.height, uz * r * p.radius);
    const inv = 1 / Math.hypot(ux, 0.55, uz);
    normals[i * 3] = ux * inv;
    normals[i * 3 + 1] = 0.55 * inv;
    normals[i * 3 + 2] = uz * inv;
    ao[i] = h;
  }
  position.needsUpdate = true;
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.setAttribute("ao", new BufferAttribute(ao, 1));
  geometry.computeBoundingSphere();
  return geometry;
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
function createForestMaterial(from, to, camPos) {
  const material = new MeshStandardNodeMaterial();
  material.metalness = 0;
  material.roughness = 0.88;
  const cull = attribute("cull", "vec4");
  const d = cull.xyz.distance(camPos);
  const t = d.sub(from).div(to.sub(from));
  material.positionNode = positionLocal.mul(step(t, cull.w));
  const ao = attribute("ao", "float");
  const region = attribute("region", "float");
  const deep = mix(color(1913624), color(3032096), region);
  const bright = mix(color(5007918), color(7244352), region);
  const detailFade = smoothstep(280, 25, positionWorld.distance(camPos));
  const clump = Fn(() => {
    const c = float(0).toVar();
    If(detailFade.greaterThan(0.01), () => {
      c.assign(mx_noise_float(positionWorld.mul(0.9)).add(mx_noise_float(positionWorld.mul(3.1)).mul(0.5)).mul(detailFade));
    });
    return c;
  })();
  const lit = ao.mul(0.5).add(0.32).add(clump.mul(0.18)).clamp();
  material.colorNode = mix(deep, bright, lit);
  material.normalNode = bumpNormal(clump.mul(0.22));
  return material;
}
export { ForestGenerator, createForestMaterial };
