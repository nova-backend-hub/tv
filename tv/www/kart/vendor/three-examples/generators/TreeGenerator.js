import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  Vector3
} from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { color, float, mx_fractal_noise_float, positionLocal, vec3 } from "three/tsl";
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const DEG2RAD = Math.PI / 180;
const TAU = Math.PI * 2;
const UP = /* @__PURE__ */ new Vector3(0, 1, 0);
const _axis = /* @__PURE__ */ new Vector3();
let _ring = new Float32Array(0);
class TreeGenerator {
  constructor(material = null) {
    this.material = material;
    this.parameters = {};
  }
  build() {
    const p = Object.assign({}, TreeGenerator.defaults, this.parameters);
    const random = createRandom(p.seed);
    const tubes = [];
    growBranch(tubes, new Vector3(), UP, p.trunkLength, p.trunkRadius, 0, p, random);
    let vertexCount = 0;
    for (const tube of tubes) vertexCount += (tube.rings.length - 1) * tube.radial * 6;
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    let offset = 0;
    for (const tube of tubes) offset = emitTube(positions, normals, offset, tube.rings, tube.radial);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new BufferAttribute(normals, 3));
    geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, this.material || createTreeMaterial());
    mesh.name = "Tree";
    return mesh;
  }
}
TreeGenerator.defaults = {
  seed: 1,
  levels: 4,
  // recursion depth: trunk, branch, twig, sub-twig
  children: [3, 12, 8],
  // sub-branches per level; density comes from many children spread along each parent, not depth
  branchAngle: [38, 50, 58],
  // degrees a child tilts off its parent axis, per level
  angleVariance: 14,
  // degrees of random jitter on the branch angle, breaks fractal regularity
  lengthRatio: 0.62,
  // child length / parent length
  trunkLength: 9,
  // trunk length in world units; sets the tree's height
  trunkRadius: 0.42,
  // base radius of the trunk
  taper: 0.55,
  // a branch thins to ( 1 - taper ) of its base radius along its own length
  taperCurve: 0.7,
  // < 1 keeps the bole full then tapers ( real trees ), 1 = straight cone
  rootFlare: 0.6,
  // how much the trunk swells at the very base
  flareFrac: 0.18,
  // fraction of the trunk over which the flare acts
  radiusExponent: 2.3,
  // pipe model ( da Vinci ): childBase = parentBase × ( 1 / children )^( 1 / radiusExponent )
  minRadius: 0.05,
  // hair-thin floor so twigs don't taper to a sliver
  minLength: 0.6,
  // branches shorter than this stop recursing
  droop: 0.05,
  // gravity sag per branch ( ≈ droop × length ); the trunk stays upright
  upPull: 0.3,
  // phototropism: 0 = a bare spread cone ( many branches aim down ), 1 = straight up
  gnarl: [0.05, 0.16, 0.26, 0.32],
  // per-level random wobble on each tube segment
  radialSegments: 6,
  // ring vertices around a tube ( drops by one per level for thin twigs )
  sectionLength: 1.3,
  // world units per tube segment, so a tall trunk stays smooth
  childStart: 0.12,
  // fraction up a sub-branch before children appear
  trunkClear: 0.25
  // fraction of the trunk kept bare before the crown ( raise for a tall clean bole )
};
for (const key of Object.keys(TreeGenerator.defaults)) {
  TreeGenerator.prototype["set" + key[0].toUpperCase() + key.slice(1)] = function(value) {
    this.parameters[key] = value;
    return this;
  };
}
function growBranch(tubes, base, dir, length, baseRadius, level, p, random) {
  const sections = Math.max(3, Math.min(24, Math.round(length / p.sectionLength)));
  const radial = Math.max(3, p.radialSegments - level);
  const step = length / sections;
  const gnarl = p.gnarl[Math.min(level, p.gnarl.length - 1)];
  const start = level === 0 ? p.trunkClear : p.childStart;
  let tangent = dir.clone().normalize();
  const normal = perpendicular(tangent);
  const rings = [];
  const pos = base.clone();
  for (let s = 0; s <= sections; s++) {
    const t = s / sections;
    let radius = baseRadius * (1 - p.taper + p.taper * Math.pow(1 - t, p.taperCurve));
    if (level === 0 && p.rootFlare > 0) {
      const flare = Math.max(0, (p.flareFrac - t) / p.flareFrac);
      radius *= 1 + p.rootFlare * flare * flare * flare;
    }
    rings.push({
      pos: pos.clone(),
      tangent: tangent.clone(),
      normal: normal.clone(),
      binormal: new Vector3().crossVectors(tangent, normal),
      radius
    });
    if (s < sections) {
      const next = tangent.clone();
      next.x += (random() * 2 - 1) * gnarl;
      next.y += (random() * 2 - 1) * gnarl;
      next.z += (random() * 2 - 1) * gnarl;
      if (level > 0) next.y -= p.droop * step;
      next.normalize();
      transport(tangent, next, normal);
      pos.addScaledVector(next, step);
      tangent = next;
    }
  }
  tubes.push({ rings, radial });
  if (level >= p.levels - 1 || length < p.minLength) return;
  const n = p.children[Math.min(level, p.children.length - 1)];
  const angle = p.branchAngle[Math.min(level, p.branchAngle.length - 1)];
  const pipeDrop = Math.pow(1 / n, 1 / p.radiusExponent);
  for (let i = 0; i < n; i++) {
    const t = start + (i + 0.5 + (random() - 0.5) * 0.6) / n * (1 - start);
    const ring = ringAt(rings, t);
    const tilt = (angle + (random() * 2 - 1) * p.angleVariance) * DEG2RAD;
    const roll = i * GOLDEN_ANGLE + (random() * 2 - 1) * 0.4;
    const childDir = ring.tangent.clone().applyAxisAngle(ring.normal, tilt).applyAxisAngle(ring.tangent, roll);
    if (p.upPull > 0) childDir.lerp(UP, p.upPull).normalize();
    const childBase = Math.max(p.minRadius, Math.min(baseRadius * pipeDrop, ring.radius));
    growBranch(tubes, ring.pos, childDir, length * p.lengthRatio, childBase, level + 1, p, random);
  }
}
function perpendicular(v) {
  const a = Math.abs(v.x) < 0.9 ? _axis.set(1, 0, 0) : _axis.set(0, 1, 0);
  return new Vector3().crossVectors(v, a).normalize();
}
function transport(t0, t1, n) {
  _axis.crossVectors(t0, t1);
  const sin = _axis.length();
  if (sin < 1e-6) return;
  _axis.divideScalar(sin);
  n.applyAxisAngle(_axis, Math.atan2(sin, t0.dot(t1)));
}
function ringAt(rings, t) {
  const f = Math.max(0, Math.min(0.999, t)) * (rings.length - 1);
  const i = Math.floor(f);
  const frac = f - i;
  const a = rings[i];
  const b = rings[Math.min(i + 1, rings.length - 1)];
  return {
    pos: a.pos.clone().lerp(b.pos, frac),
    tangent: a.tangent.clone().lerp(b.tangent, frac).normalize(),
    normal: a.normal.clone().lerp(b.normal, frac).normalize(),
    radius: a.radius + (b.radius - a.radius) * frac
  };
}
function emitTube(positions, normals, offset, rings, radial) {
  const stride = (radial + 1) * 6;
  const needed = rings.length * stride;
  if (_ring.length < needed) _ring = new Float32Array(needed);
  const ring = _ring;
  for (let r = 0; r < rings.length; r++) {
    const { pos, normal, binormal, radius } = rings[r];
    let o = r * stride;
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const nx = c * normal.x + s * binormal.x;
      const ny = c * normal.y + s * binormal.y;
      const nz = c * normal.z + s * binormal.z;
      ring[o++] = pos.x + nx * radius;
      ring[o++] = pos.y + ny * radius;
      ring[o++] = pos.z + nz * radius;
      ring[o++] = nx;
      ring[o++] = ny;
      ring[o++] = nz;
    }
  }
  for (let r = 0; r < rings.length - 1; r++) {
    const a = r * stride;
    const b = (r + 1) * stride;
    for (let j = 0; j < radial; j++) {
      const aL = a + j * 6, aR = a + (j + 1) * 6;
      const bL = b + j * 6, bR = b + (j + 1) * 6;
      offset = copyVertex(positions, normals, offset, ring, aL);
      offset = copyVertex(positions, normals, offset, ring, bR);
      offset = copyVertex(positions, normals, offset, ring, bL);
      offset = copyVertex(positions, normals, offset, ring, aL);
      offset = copyVertex(positions, normals, offset, ring, aR);
      offset = copyVertex(positions, normals, offset, ring, bR);
    }
  }
  return offset;
}
function copyVertex(positions, normals, offset, ring, i) {
  const o = offset * 3;
  positions[o] = ring[i];
  positions[o + 1] = ring[i + 1];
  positions[o + 2] = ring[i + 2];
  normals[o] = ring[i + 3];
  normals[o + 1] = ring[i + 4];
  normals[o + 2] = ring[i + 5];
  return offset + 1;
}
function createRandom(seed) {
  let s = seed >>> 0 || 1;
  return function() {
    s = s + 1831565813 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function createTreeMaterial(parameters = {}) {
  const c = parameters.barkColor;
  const barkColor = c === void 0 ? color(4930091) : c.isColor || typeof c === "number" ? color(c) : c;
  const material = new MeshStandardNodeMaterial();
  const grain = mx_fractal_noise_float(positionLocal.mul(vec3(2.5, 0.4, 2.5)), 3).mul(0.18);
  material.colorNode = barkColor.mul(grain.add(0.9));
  material.roughnessNode = float(0.95);
  material.metalnessNode = float(0);
  return material;
}
export { TreeGenerator, createTreeMaterial };
