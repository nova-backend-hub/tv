import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ExtrudeGeometry,
  InterpolationSamplingMode,
  InterpolationSamplingType,
  LatheGeometry,
  Matrix3,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Path,
  PlaneGeometry,
  ShapeGeometry,
  Shape,
  Sphere,
  Vector2,
  Vector3
} from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { attribute, cameraPosition, color, cross, dot, float, floor, Fn, fract, fwidth, hash as ihash, mix, mod, modelWorldMatrixInverse, mx_fractal_noise_float, mx_noise_float, normalLocal, normalView, normalWorldGeometry, positionLocal, positionView, positionWorld, select, smoothstep, step, uint, uv, varying, vec2, vec3, vec4 } from "three/tsl";
import { mergeGeometries } from "../../utils/BufferGeometryUtils.js";
const _scale = /* @__PURE__ */ new Vector3();
const _point = /* @__PURE__ */ new Vector3();
const _normalMatrix = /* @__PURE__ */ new Matrix3();
const _identity = /* @__PURE__ */ new Matrix4();
const PartId = { WALL: 0, PIER: 1, FRAME: 2, ORNAMENT: 3, GLASS: 4, AC: 5 };
const { WALL, PIER, FRAME, ORNAMENT, GLASS, AC } = PartId;
const WINDOW_HEIGHT_RATIO = 0.62;
const WINDOW_BORDER = 0.1;
const BRICK = { height: 0.3, length: 0.6 };
function merge(geometries) {
  return mergeGeometries(geometries.map((g) => g.index ? g.toNonIndexed() : g));
}
function nonIndexed(geometry) {
  return geometry.index ? geometry.toNonIndexed() : geometry;
}
const _unitBox = /* @__PURE__ */ nonIndexed(new BoxGeometry(1, 1, 1));
function bakeGroups(groups) {
  let total = 0;
  for (const group of groups) total += group.geometry.attributes.position.count * group.matrices.length;
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const uv2 = new Float32Array(total * 2);
  const partId = new Float32Array(total);
  const roomCenter = new Float32Array(total * 3);
  const roomSize = new Float32Array(total * 2);
  let w = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const group of groups) {
    const geometry2 = group.geometry;
    const P = geometry2.attributes.position.array;
    const N = geometry2.attributes.normal.array;
    const U = geometry2.attributes.uv.array;
    const count = geometry2.attributes.position.count;
    const id = group.partId;
    const rooms = group.rooms;
    const rigid = group.rigid === true;
    for (let i = 0; i < group.matrices.length; i++) {
      const room = rooms ? rooms[i] : null;
      const matrix = group.matrices[i];
      const e = matrix.elements;
      const e0 = e[0], e1 = e[1], e2 = e[2], e4 = e[4], e5 = e[5], e6 = e[6], e8 = e[8], e9 = e[9], e10 = e[10], e12 = e[12], e13 = e[13], e14 = e[14];
      let n0, n1, n2, n3, n4, n5, n6, n7, n8;
      if (rigid) {
        n0 = e0;
        n1 = e1;
        n2 = e2;
        n3 = e4;
        n4 = e5;
        n5 = e6;
        n6 = e8;
        n7 = e9;
        n8 = e10;
      } else {
        const ne = _normalMatrix.getNormalMatrix(matrix).elements;
        n0 = ne[0];
        n1 = ne[1];
        n2 = ne[2];
        n3 = ne[3];
        n4 = ne[4];
        n5 = ne[5];
        n6 = ne[6];
        n7 = ne[7];
        n8 = ne[8];
      }
      for (let v = 0; v < count; v++) {
        const v3 = v * 3, w3 = w * 3;
        const x = P[v3], y = P[v3 + 1], z = P[v3 + 2];
        const wx = e0 * x + e4 * y + e8 * z + e12;
        const wy = e1 * x + e5 * y + e9 * z + e13;
        const wz = e2 * x + e6 * y + e10 * z + e14;
        position[w3] = wx;
        position[w3 + 1] = wy;
        position[w3 + 2] = wz;
        if (wx < minX) minX = wx;
        if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy;
        if (wy > maxY) maxY = wy;
        if (wz < minZ) minZ = wz;
        if (wz > maxZ) maxZ = wz;
        const nx = N[v3], ny = N[v3 + 1], nz = N[v3 + 2];
        const tx = n0 * nx + n3 * ny + n6 * nz, ty = n1 * nx + n4 * ny + n7 * nz, tz = n2 * nx + n5 * ny + n8 * nz;
        const inv = 1 / (Math.sqrt(tx * tx + ty * ty + tz * tz) || 1);
        normal[w3] = tx * inv;
        normal[w3 + 1] = ty * inv;
        normal[w3 + 2] = tz * inv;
        uv2[w * 2] = U[v * 2];
        uv2[w * 2 + 1] = U[v * 2 + 1];
        partId[w] = id;
        if (room !== null) {
          roomCenter[w3] = room.center.x;
          roomCenter[w3 + 1] = room.center.y;
          roomCenter[w3 + 2] = room.center.z;
          roomSize[w * 2] = room.size.x;
          roomSize[w * 2 + 1] = room.size.y;
        }
        w++;
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(position, 3));
  geometry.setAttribute("normal", new BufferAttribute(normal, 3));
  geometry.setAttribute("uv", new BufferAttribute(uv2, 2));
  geometry.setAttribute("partId", new BufferAttribute(partId, 1));
  geometry.setAttribute("roomCenter", new BufferAttribute(roomCenter, 3));
  geometry.setAttribute("roomSize", new BufferAttribute(roomSize, 2));
  geometry.boundingSphere = new Sphere(
    new Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2),
    Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2
  );
  return geometry;
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
function floorHash(f, frame, k) {
  const s = Math.sin(f * 12.9898 + frame.origin.x * 0.07 + frame.origin.z * 0.131 + k) * 43758.5453;
  return s - Math.floor(s);
}
function randomStyle(random) {
  const base = 0.1 + random() * 0.07;
  const crown = 0.08 + random() * 0.08;
  return {
    footprint: { width: 26 + random() * 18, depth: 20 + random() * 14 },
    tierFractions: { base, crown },
    pierWidth: 0.4 + random() * 0.4,
    pierDepth: 0.3 + random() * 0.3,
    windowReveal: 0.12 + random() * 0.1,
    stringCourseHeight: 0.5 + random() * 0.5,
    archBayWidthRatio: Math.round(1.5 + random() * 1.5),
    archRise: 0.4 + random() * 0.5
  };
}
class SkyscraperGenerator {
  constructor(parameters = {}, material = null) {
    this.parameters = parameters;
    this.material = material;
    this.mesh = null;
  }
  setParameters(parameters) {
    Object.assign(this.parameters, parameters);
    return this;
  }
  build() {
    const random = createRandom(this.parameters.seed ?? SkyscraperGenerator.defaults.seed);
    const p = Object.assign({}, SkyscraperGenerator.defaults, randomStyle(random), this.parameters);
    const vModule = BRICK.height * 2;
    p.floorHeight = Math.max(vModule * 3, Math.round(p.floorHeight / vModule) * vModule);
    p.windowHeight = Math.round(p.floorHeight * WINDOW_HEIGHT_RATIO / vModule) * vModule;
    p.bayWidth = Math.max(BRICK.length * 3, Math.round(p.bayWidth / BRICK.length) * BRICK.length);
    p.pierWidth = Math.max(BRICK.length, Math.round(p.pierWidth / BRICK.length) * BRICK.length);
    const floors = Math.max(3, Math.round(p.totalHeight / p.floorHeight));
    const baseFloors = Math.max(1, Math.round(floors * p.tierFractions.base));
    const crownFloors = Math.max(1, Math.round(floors * p.tierFractions.crown));
    const shaftFloors = Math.max(1, floors - baseFloors - crownFloors);
    const baseHeight = baseFloors * p.floorHeight;
    const crownHeight = crownFloors * p.floorHeight;
    const shaftHeight = shaftFloors * p.floorHeight;
    p.totalHeight = baseHeight + shaftHeight + crownHeight;
    const baseTop = baseHeight;
    const shaftTop = baseHeight + shaftHeight;
    const windows = [];
    const glass = [];
    const glassRooms = [];
    const backWalls = [];
    const bands = [];
    const piers = /* @__PURE__ */ new Map();
    const trim = [];
    const acUnits = [];
    const finials = [];
    const extras = [];
    const addPier = (frame, u, vBottom, height) => {
      const key = Math.round(height * 1e3);
      if (piers.has(key) === false) piers.set(key, []);
      piers.get(key).push(frame.matrix(u, vBottom, 0));
    };
    const footprint = buildFootprint(p.footprint.width, p.footprint.depth, p.chamferWidth, p.chamferCornerX, p.chamferCornerZ);
    const faces = buildFaces(footprint);
    const inset = p.setbackDepth * p.bayWidth;
    const crownFootprint = buildFootprint(
      Math.max(p.bayWidth * 2, p.footprint.width - inset * 2),
      Math.max(p.bayWidth * 2, p.footprint.depth - inset * 2),
      Math.max(0, p.chamferWidth - inset),
      p.chamferCornerX,
      p.chamferCornerZ
    );
    const crownFaces = buildFaces(crownFootprint);
    const crownCornice = p.stringCourseHeight * 1.6;
    const tiers = [
      { faces, bottom: baseTop, height: shaftHeight, pierHeight: shaftHeight, ac: acUnits },
      { faces: crownFaces, bottom: shaftTop, height: crownHeight, pierHeight: crownHeight - crownCornice, ac: null }
    ];
    for (const t of tiers) {
      for (const frame of t.faces) {
        addWindows(frame, windows, glass, glassRooms, t.ac, t.bottom, t.height, p);
        addWall(backWalls, frame, t.bottom, t.bottom + t.height, 0.8, -0.6);
        addSpandrelBands(bands, frame, t.bottom, t.height, p);
        addPiers(frame, t.bottom, t.pierHeight, p, addPier);
      }
    }
    for (const frame of faces) {
      addArcade(extras, frame, baseHeight, p);
      addCornice(trim, frame, baseTop - p.stringCourseHeight, p.stringCourseHeight, 0.5);
    }
    if (p.stringCourseEvery > 0) {
      for (let f = p.stringCourseEvery; f < shaftFloors; f += p.stringCourseEvery) {
        for (const frame of faces) addCornice(trim, frame, baseTop + f * p.floorHeight - p.stringCourseHeight * 0.5, p.stringCourseHeight, 0.3);
      }
    }
    for (const frame of crownFaces) {
      addCornice(trim, frame, p.totalHeight - crownCornice, crownCornice, 0.9);
      addParapet(trim, frame, p.totalHeight, p);
      addFinials(frame, finials, shaftTop, crownHeight, p);
    }
    extras.push(slab(footprint, shaftTop, 0.6));
    extras.push(slab(crownFootprint, p.totalHeight, 0.6));
    const groups = [
      { geometry: buildWindowGeometry(p), matrices: windows, partId: FRAME, rigid: true },
      { geometry: nonIndexed(buildGlassGeometry(p)), matrices: glass, partId: GLASS, rooms: glassRooms, rigid: true },
      { geometry: _unitBox, matrices: bands, partId: WALL }
    ];
    for (const [key, matrices] of piers) groups.push({ geometry: buildPierGeometry(p, key / 1e3), matrices, partId: PIER, rigid: true });
    groups.push({ geometry: _unitBox, matrices: trim, partId: WALL });
    groups.push({ geometry: _unitBox, matrices: acUnits, partId: AC });
    groups.push({ geometry: nonIndexed(buildFinialGeometry(p)), matrices: finials, partId: ORNAMENT, rigid: true });
    for (const geometry2 of extras) groups.push({ geometry: nonIndexed(geometry2), matrices: [_identity], partId: WALL, rigid: true });
    groups.push({ geometry: _unitBox, matrices: backWalls, partId: WALL });
    const geometry = bakeGroups(groups);
    const mesh = new Mesh(geometry, this.material || new MeshStandardMaterial({ color: 14535850, roughness: 0.9 }));
    mesh.name = "Skyscraper";
    this.dispose();
    this.mesh = mesh;
    return mesh;
  }
  rebuild() {
    return this.build();
  }
  dispose() {
    if (this.mesh === null) return;
    this.mesh.geometry.dispose();
    this.mesh = null;
  }
}
SkyscraperGenerator.defaults = {
  seed: 35,
  totalHeight: 140,
  floorHeight: 4,
  bayWidth: 2.6,
  stringCourseEvery: 6,
  chamferWidth: 4,
  chamferCornerX: 1,
  chamferCornerZ: 1,
  setbackDepth: 1.5,
  acChance: 0.12
};
function buildFootprint(width, depth, chamfer, cornerX = 1, cornerZ = 1) {
  const hw = width / 2;
  const hd = depth / 2;
  const c = Math.min(chamfer, hw, hd);
  const corners = [
    new Vector2(hw, hd),
    new Vector2(-hw, hd),
    new Vector2(-hw, -hd),
    new Vector2(hw, -hd)
  ];
  const points = [];
  for (let i = 0; i < corners.length; i++) {
    const corner = corners[i];
    if (c > 0 && Math.sign(corner.x) === cornerX && Math.sign(corner.y) === cornerZ) {
      const prev = corners[(i + 3) % 4];
      const next = corners[(i + 1) % 4];
      points.push(corner.clone().lerp(prev, c / corner.distanceTo(prev)));
      points.push(corner.clone().lerp(next, c / corner.distanceTo(next)));
    } else {
      points.push(corner.clone());
    }
  }
  return points;
}
function buildFaces(points) {
  const faces = [];
  const up = new Vector3(0, 1, 0);
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const n = new Vector3(b.y - a.y, 0, -(b.x - a.x)).normalize();
    const mid = new Vector3((a.x + b.x) / 2, 0, (a.y + b.y) / 2);
    if (n.dot(mid) < 0) n.negate();
    const u = new Vector3().crossVectors(up, n).normalize();
    const pa = new Vector3(a.x, 0, a.y);
    const pb = new Vector3(b.x, 0, b.y);
    const length = pa.distanceTo(pb);
    const origin = pb.clone().sub(pa).dot(u) > 0 ? pa : pb;
    faces.push(new FaceFrame(origin, u, up.clone(), n, length));
  }
  return faces;
}
class FaceFrame {
  constructor(origin, u, v, n, length) {
    this.origin = origin;
    this.u = u;
    this.v = v;
    this.n = n;
    this.length = length;
  }
  point(u, v, w, target = new Vector3()) {
    return target.copy(this.origin).addScaledVector(this.u, u).addScaledVector(this.v, v).addScaledVector(this.n, w);
  }
  /** Places a piece authored in the canonical local frame ( x across, y up, z outward ). */
  matrix(u, v, w) {
    return new Matrix4().makeBasis(this.u, this.v, this.n).setPosition(this.point(u, v, w, _point));
  }
  /** How many bays of `bayWidth` fit, with the remainder split into end margins. */
  bays(bayWidth) {
    const count = Math.max(1, Math.floor(this.length / bayWidth));
    const margin = (this.length - count * bayWidth) / 2;
    return { count, margin, width: bayWidth };
  }
}
function boxMatrix(frame, u, v, w, sizeU, sizeV, sizeN) {
  return new Matrix4().makeBasis(frame.u, frame.v, frame.n).scale(_scale.set(sizeU, sizeV, sizeN)).setPosition(frame.point(u, v, w, _point));
}
function addWall(target, frame, vBottom, vTop, thickness = 0.8, front = 0) {
  const h = vTop - vBottom;
  target.push(boxMatrix(frame, frame.length / 2, vBottom + h / 2, front - thickness / 2, frame.length + thickness * 2, h, thickness));
}
function addSpandrelBands(target, frame, vBottom, height, p) {
  const floors = Math.max(1, Math.round(height / p.floorHeight));
  const fh = height / floors;
  const bandHeight = p.floorHeight - p.windowHeight;
  const bandLength = Math.max(0.2, frame.length - 0.6);
  for (let f = 0; f <= floors; f++) {
    target.push(boxMatrix(frame, frame.length / 2, vBottom + f * fh, -0.3, bandLength, bandHeight, 0.6));
  }
}
function slab(footprint, y, thickness) {
  const inset = 0.8;
  let cx = 0, cz = 0;
  for (const p of footprint) {
    cx += p.x;
    cz += p.y;
  }
  cx /= footprint.length;
  cz /= footprint.length;
  let area = 0;
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i], b = footprint[(i + 1) % footprint.length];
    area += a.x * b.y - b.x * a.y;
  }
  const pts = area < 0 ? footprint.slice().reverse() : footprint;
  const shape = new Shape();
  pts.forEach((p, i) => {
    const dx = cx - p.x, dz = cz - p.y;
    const d = Math.hypot(dx, dz) || 1;
    const x = p.x + dx / d * inset;
    const z = p.y + dz / d * inset;
    if (i === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  });
  const drop = 0.2;
  const geometry = new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, y - drop, 0);
  return geometry;
}
function addCornice(target, frame, vBottom, height, depth) {
  target.push(boxMatrix(frame, frame.length / 2, vBottom + height * 0.275, depth / 2, frame.length, height * 0.55, depth));
  target.push(boxMatrix(frame, frame.length / 2, vBottom + height * 0.775, depth * 0.85, frame.length, height * 0.45, depth * 1.7));
}
function addParapet(target, frame, vTop, p) {
  const height = 1.4;
  target.push(boxMatrix(frame, frame.length / 2, vTop + height / 2, p.pierDepth * 0.4, frame.length, height, p.pierDepth * 0.8));
}
function addArcade(target, frame, height, p) {
  const archWidth = p.bayWidth * p.archBayWidthRatio;
  const { count, margin } = frame.bays(archWidth);
  const sill = height * 0.04;
  const spring = height * 0.55;
  const apex = Math.min(height * 0.96, spring + archWidth / 2 * (0.8 + p.archRise));
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.lineTo(frame.length, 0);
  shape.lineTo(frame.length, height);
  shape.lineTo(0, height);
  shape.lineTo(0, 0);
  for (let i = 0; i < count; i++) {
    const cx = margin + (i + 0.5) * archWidth;
    const hw = archWidth * 0.34;
    const hole = new Path();
    hole.moveTo(cx - hw, sill);
    hole.lineTo(cx - hw, spring);
    hole.quadraticCurveTo(cx - hw, apex, cx, apex);
    hole.quadraticCurveTo(cx + hw, apex, cx + hw, spring);
    hole.lineTo(cx + hw, sill);
    hole.lineTo(cx - hw, sill);
    shape.holes.push(hole);
  }
  const thickness = 1.1;
  const geometry = new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 8 });
  geometry.translate(0, 0, -thickness);
  geometry.applyMatrix4(frame.matrix(0, 0, 0));
  target.push(geometry);
  const back = new PlaneGeometry(frame.length, height);
  back.applyMatrix4(frame.matrix(frame.length / 2, height / 2, -thickness - 0.4));
  target.push(back);
}
function addPiers(frame, vBottom, height, p, addPier) {
  const { count, margin, width } = frame.bays(p.bayWidth);
  for (let i = 0; i < count; i++) {
    addPier(frame, margin + i * width, vBottom, height);
  }
}
function addWindows(frame, windows, glass, glassRooms, acUnits, vBottom, height, p) {
  const { count, margin, width } = frame.bays(p.bayWidth);
  const floors = Math.max(1, Math.round(height / p.floorHeight));
  const fh = height / floors;
  const acW = Math.min((p.bayWidth - p.pierWidth) * 0.55, 0.66);
  const acH = acW * 0.6;
  const acD = acW * 0.5;
  const acV = -p.windowHeight / 2 + acH / 2 + WINDOW_BORDER;
  const acFits = acW >= (width - p.pierWidth) * 0.34;
  for (let f = 0; f < floors; f++) {
    const cy = vBottom + (f + 0.5) * fh;
    const roomBays = floorHash(f, frame, 0) > 0.5 ? 3 : 2;
    const roomPhase = Math.floor(floorHash(f, frame, 1) * roomBays);
    for (let b = 0; b < count; b++) {
      const cx = margin + (b + 0.5) * width;
      windows.push(frame.matrix(cx, cy, 0));
      glass.push(frame.matrix(cx, cy, -p.windowReveal));
      const room = Math.floor((b + roomPhase) / roomBays);
      const bStart = Math.max(0, room * roomBays - roomPhase);
      const bEnd = Math.min(count, (room + 1) * roomBays - roomPhase);
      const span = bEnd - bStart;
      glassRooms.push({ center: frame.point(margin + (bStart + span / 2) * width, cy, -p.windowReveal), size: new Vector2(span * width, fh - 1) });
      if (acUnits && acFits) {
        const r = Math.sin(f * 41.3 + b * 12.7 + frame.origin.x * 0.13 + frame.origin.z * 0.31) * 43758.5453;
        const acW0 = acD / 2 - p.windowReveal + 0.04;
        if (r - Math.floor(r) < p.acChance) acUnits.push(boxMatrix(frame, cx, cy + acV, acW0, acW, acH, acD));
      }
    }
  }
}
function addFinials(frame, finials, vBottom, height, p) {
  const { count, margin, width } = frame.bays(p.bayWidth);
  const top = vBottom + height;
  for (let i = 0; i < count; i++) {
    finials.push(new Matrix4().setPosition(frame.point(margin + i * width, top, p.pierDepth * 0.5, _point)));
  }
}
function buildPierGeometry(p, height) {
  const back = new BoxGeometry(p.pierWidth, height, p.pierDepth * 0.6);
  back.translate(0, height / 2, p.pierDepth * 0.3);
  const pilasterHeight = Math.max(1, height - 0.6);
  const front = new BoxGeometry(p.pierWidth * 0.55, pilasterHeight, p.pierDepth * 0.45);
  front.translate(0, pilasterHeight / 2, p.pierDepth * 0.6 + p.pierDepth * 0.225);
  return merge([back, front]);
}
function buildWindowGeometry(p) {
  const w = p.bayWidth - p.pierWidth;
  const h = p.windowHeight;
  const border = WINDOW_BORDER;
  const depth = p.windowReveal;
  const iw = w / 2 - border;
  const ih = h / 2 - border;
  const shape = new Shape();
  shape.moveTo(-w / 2, -h / 2);
  shape.lineTo(w / 2, -h / 2);
  shape.lineTo(w / 2, h / 2);
  shape.lineTo(-w / 2, h / 2);
  shape.lineTo(-w / 2, -h / 2);
  const hole = new Path();
  hole.moveTo(-iw, -ih);
  hole.lineTo(-iw, ih);
  hole.lineTo(iw, ih);
  hole.lineTo(iw, -ih);
  hole.lineTo(-iw, -ih);
  shape.holes.push(hole);
  const front = new ShapeGeometry(shape);
  const wall = (x, y, rx, ry, sw, sh) => {
    const pl = new PlaneGeometry(sw, sh);
    pl.rotateX(rx);
    pl.rotateY(ry);
    pl.translate(x, y, -depth / 2);
    return pl;
  };
  const left = wall(-iw, 0, 0, Math.PI / 2, depth, ih * 2);
  const right = wall(iw, 0, 0, -Math.PI / 2, depth, ih * 2);
  const sill = wall(0, -ih, -Math.PI / 2, 0, iw * 2, depth);
  const head = wall(0, ih, Math.PI / 2, 0, iw * 2, depth);
  const transom = new PlaneGeometry(iw * 2, 0.05);
  transom.translate(0, h * 0.04, -depth + 0.02);
  return merge([front, left, right, sill, head, transom]);
}
function buildGlassGeometry(p) {
  const w = p.bayWidth - p.pierWidth - WINDOW_BORDER * 2;
  const h = p.windowHeight - WINDOW_BORDER * 2;
  return new PlaneGeometry(w, h);
}
function buildFinialGeometry(p) {
  const s = p.pierWidth;
  const profile = [
    new Vector2(0, 0),
    new Vector2(s * 0.9, 0),
    new Vector2(s * 0.9, s * 0.4),
    new Vector2(s * 0.55, s * 1),
    new Vector2(0, s * 3.2)
  ];
  return new LatheGeometry(profile, 8);
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
const interior = /* @__PURE__ */ Fn(() => {
  const roomCenter = varying(attribute("roomCenter", "vec3")).setInterpolation(InterpolationSamplingType.FLAT, InterpolationSamplingMode.EITHER);
  const roomSize = attribute("roomSize", "vec2");
  const n = normalLocal;
  const up = vec3(0, 1, 0);
  const uAxis = cross(up, n).normalize();
  const d = positionLocal.sub(roomCenter);
  const camLocal = modelWorldMatrixInverse.mul(vec4(cameraPosition, 1)).xyz;
  const rayLocal = positionLocal.sub(camLocal).normalize();
  const origin = vec3(dot(d, uAxis), d.y, 0);
  const dir = vec3(dot(rayLocal, uAxis), rayLocal.y, dot(rayLocal, n).negate());
  const setback = float(0.1);
  const boxMax = vec3(roomSize.x.mul(0.5), roomSize.y.mul(0.5), setback.add(roomSize.y.mul(1.55)));
  const boxMin = vec3(boxMax.x.negate(), boxMax.y.negate(), setback);
  const tFar = boxMin.sub(origin).div(dir).max(boxMax.sub(origin).div(dir));
  const t = tFar.x.min(tFar.y).min(tFar.z);
  const hit = origin.add(dir.mul(t));
  const q = hit.sub(boxMin).div(boxMax.sub(boxMin));
  const onBack = q.z.greaterThan(0.998);
  const onCeil = q.y.greaterThan(0.998);
  const onFloor = q.y.lessThan(2e-3);
  const cell = floor(roomCenter.mul(2));
  const ckey = uint(cell.x.add(1 << 21)).mul(uint(73856093)).bitXor(uint(cell.y.add(1 << 21)).mul(uint(19349663))).bitXor(uint(cell.z.add(1 << 21)).mul(uint(83492791))).toVar();
  const hash = (kx, ky, kz) => ihash(ckey.add(uint(Math.round((kx + ky * 7 + kz * 13) * 100))));
  const seed = hash(12.9898, 78.233, 37.719);
  const seed2 = hash(39.346, 11.135, 83.155);
  const lit = step(0.8, hash(63.21, 9.17, 51.43));
  const warmLight = mix(color(16758853), color(16770204), hash(27.1, 4.9, 61.7));
  const coolLight = mix(color(14674175), color(10467071), hash(8.3, 51.2, 17.6));
  const lightCol = select(hash(44.7, 19.3, 6.1).greaterThan(0.88), coolLight, warmLight);
  const depth = roomSize.y.mul(1.55);
  const falloffAt = (z) => mix(float(1), float(0.42), z.sub(setback).div(depth).clamp(0, 1));
  const rect = (ax, ay, cx, cy, hw, hh) => smoothstep(hw + 6e-3, hw - 6e-3, ax.sub(cx).abs()).mul(smoothstep(hh + 6e-3, hh - 6e-3, ay.sub(cy).abs()));
  let wall = mix(color(10128243), color(7305858), seed);
  wall = mix(wall, color(12168599), seed2.mul(0.6));
  const wallCol = mix(wall, wall.mul(0.5), smoothstep(0.05, 0.04, q.y));
  const seam = step(0.94, fract(q.x.mul(6)));
  const boards = mix(color(4862752), color(6966320), seed).mul(seam.mul(0.3).oneMinus());
  const rug = mix(color(8010546), color(3823456), seed2);
  const floorCol = mix(boards, rug, rect(q.x, q.z, 0.5, 0.62, 0.3, 0.26).mul(0.9));
  const lamp = smoothstep(0.16, 0.13, vec2(q.x.sub(0.5), q.z.sub(0.5)).length());
  const ceilCol = mix(mix(wall, color(16777215), 0.5), lightCol.mul(mix(float(1), float(4.5), lit)), lamp);
  const doorX = mix(float(0.22), float(0.78), seed);
  const door = mix(color(5916209), color(3749948), step(0.5, seed2));
  const picX = select(doorX.lessThan(0.5), mix(float(0.68), float(0.82), seed2), mix(float(0.18), float(0.32), seed2));
  const picCol = mix(color(2898506), color(8018490), hash(5.1, 9.2, 3.3));
  let backCol = mix(wallCol, door, rect(q.x, q.y, doorX, 0.33, 0.085, 0.35));
  backCol = mix(backCol, color(1315344), rect(q.x, q.y, picX, 0.56, 0.075, 0.085));
  backCol = mix(backCol, picCol, rect(q.x, q.y, picX, 0.56, 0.055, 0.065));
  const shellCol = select(onBack, backCol, select(onCeil, ceilCol, select(onFloor, floorCol, wallCol)));
  const aoBand = 0.15;
  const aoEdge = (a) => smoothstep(0, aoBand, a).mul(smoothstep(0, aoBand, a.oneMinus()));
  const edgeAO = select(onBack, aoEdge(q.x).mul(aoEdge(q.y)), select(onFloor.or(onCeil), aoEdge(q.x).mul(aoEdge(q.z)), aoEdge(q.y).mul(aoEdge(q.z))));
  const shellAO = mix(float(0.72), float(1), edgeAO);
  let bestT = t;
  let bestCol = shellCol.mul(shellAO).mul(falloffAt(hit.z));
  let bestEmit = float(1);
  const boxHit = (bMin, bMax) => {
    const ta = bMin.sub(origin).div(dir);
    const tb = bMax.sub(origin).div(dir);
    const lo = ta.min(tb), hi = ta.max(tb);
    const tN = lo.x.max(lo.y).max(lo.z);
    const p = origin.add(dir.mul(tN));
    return { tN, p, hit: hi.x.min(hi.y).min(hi.z).greaterThan(tN).and(tN.greaterThan(0)), qb: p.sub(bMin).div(bMax.sub(bMin)) };
  };
  const consider = (h, tN, c, emit = 1) => {
    const near = h.and(tN.lessThan(bestT));
    bestCol = select(near, c, bestCol);
    bestEmit = select(near, float(emit), bestEmit);
    bestT = select(near, tN, bestT);
  };
  const halfU = boxMax.x, floorY = boxMin.y, ceilY = boxMax.y, backZ = boxMax.z;
  const midZ = setback.add(depth.mul(0.5));
  const tCx = mix(float(-0.6), float(0.6), seed);
  const tCz = midZ.add(mix(float(-0.4), float(0.5), seed2));
  const tbl = boxHit(vec3(tCx.sub(0.6), floorY, tCz.sub(0.35)), vec3(tCx.add(0.6), floorY.add(0.42), tCz.add(0.35)));
  const tblCol = mix(color(4863270), color(7031344), seed2).mul(select(tbl.qb.y.greaterThan(0.94), float(1.25), float(0.8)));
  consider(tbl.hit, tbl.tN, tblCol.mul(falloffAt(tbl.p.z)));
  const sofaCx = mix(halfU.mul(-0.3), halfU.mul(0.3), seed2);
  const sofa = boxHit(vec3(sofaCx.sub(1.1), floorY, backZ.sub(0.95)), vec3(sofaCx.add(1.1), floorY.add(mix(float(0.8), float(0.9), seed)), backZ.sub(0.1)));
  const sofaCol = mix(color(5917242), color(4347498), seed).mul(select(sofa.qb.y.greaterThan(0.9), float(1.12), float(0.85)));
  consider(sofa.hit, sofa.tN, sofaCol.mul(falloffAt(sofa.p.z)));
  const wardrobe = (cx, gate, h) => {
    const w = boxHit(vec3(cx.sub(0.5), floorY, backZ.sub(0.7)), vec3(cx.add(0.5), floorY.add(h), backZ.sub(0.1)));
    const c = mix(color(3812386), color(5588794), seed).mul(select(w.qb.y.greaterThan(0.94), float(1.2), float(0.82)));
    consider(w.hit.and(gate), w.tN, c.mul(falloffAt(w.p.z)));
  };
  wardrobe(halfU.mul(-0.82), hash(7.3, 2.1, 9.9).greaterThan(0.4), mix(float(1.7), float(2.3), seed));
  wardrobe(halfU.mul(0.82), hash(3.7, 8.4, 1.5).greaterThan(0.4), mix(float(1.7), float(2.3), seed2));
  const swatch = (a, b) => mix(color(a), color(b), seed2);
  const pick = hash(22.4, 6.7, 91.2).mul(6);
  let fabric = swatch(13287334, 14208440);
  fabric = select(pick.greaterThan(1), swatch(9075300, 10194034), fabric);
  fabric = select(pick.greaterThan(2), swatch(7367268, 8617334), fabric);
  fabric = select(pick.greaterThan(3), swatch(6254713, 7307659), fabric);
  fabric = select(pick.greaterThan(4), swatch(7107928, 7963487), fabric);
  fabric = select(pick.greaterThan(5), swatch(9198148, 10119762), fabric);
  const drape = (bMin, bMax, gate) => {
    const h = boxHit(bMin, bMax);
    const pleat = fabric.mul(mix(float(0.78), float(1.12), fract(h.p.x.mul(2.5))));
    consider(h.hit.and(gate), h.tN, pleat.mul(falloffAt(h.p.z)), 0.2);
  };
  const cz0 = setback, cz1 = setback.add(0.12);
  const sL = smoothstep(0.3, 1, seed), sR = smoothstep(0.3, 1, seed2);
  const lw = halfU.mul(sL.mul(sL));
  const rw = halfU.mul(sR.mul(sR));
  drape(vec3(halfU.negate(), floorY, cz0), vec3(halfU.negate().add(lw), ceilY, cz1), lw.greaterThan(0.05));
  drape(vec3(halfU.sub(rw), floorY, cz0), vec3(halfU, ceilY, cz1), rw.greaterThan(0.05));
  const warmth = mix(vec3(1, 1, 1), lightCol, lit.mul(0.85));
  return vec4(bestCol.mul(warmth).mul(mix(float(1), float(1.3), lit)), lit.mul(bestEmit));
});
const buildingPalette = [
  11031868,
  10242612,
  // terracotta & red brick ( occasional accent )
  9071186,
  8217680,
  // warm brick / brownstone ( muted )
  12886896,
  12098159,
  12759427,
  // buff / tan
  13025458,
  13025458,
  12433320,
  13749438,
  11841441,
  // limestone / pale dressed stone — the common default
  10131599,
  9144707,
  10855322,
  // grey granite / concrete
  14407371,
  // pale glazed ( accent )
  8160909
  // steel / glass ( cool accent )
];
function pickBuildingColor(seed) {
  const h = Math.abs(Math.sin(seed * 12.9898) * 43758.5453);
  return buildingPalette[Math.floor((h - Math.floor(h)) * buildingPalette.length)];
}
function createSkyscraperMaterial(buildingBase = color(13025458)) {
  const soot = color(4866614);
  const tone = mx_fractal_noise_float(positionWorld.mul(0.03), 2).mul(0.18);
  const mottle = mx_noise_float(positionWorld.mul(0.7)).mul(0.06);
  const streak = mx_fractal_noise_float(vec3(positionWorld.x.mul(1.5), positionWorld.y.mul(0.04), positionWorld.z.mul(1.5)), 2);
  const dirt = smoothstep(-0.1, 0.45, streak).mul(smoothstep(210, 0, positionWorld.y)).mul(0.6);
  const brickH = BRICK.height;
  const brickL = BRICK.length;
  const mortar = 0.025;
  const nrm = normalWorldGeometry.abs();
  const across = positionLocal.x.mul(normalWorldGeometry.z).sub(positionLocal.z.mul(normalWorldGeometry.x));
  const rowCoord = positionLocal.y.div(brickH);
  const courseRow = floor(rowCoord);
  const colCoord = across.div(brickL).add(mod(courseRow, 2).mul(0.5));
  const mU = mortar / (2 * brickL);
  const mV = mortar / (2 * brickH);
  const ddU = nrm.z.mul(fwidth(positionWorld.x)).add(nrm.x.mul(fwidth(positionWorld.z))).div(brickL).clamp(1e-6, 0.5);
  const ddV = fwidth(rowCoord).clamp(1e-6, 0.5);
  const distU = float(0.5).sub(fract(colCoord).sub(0.5).abs());
  const distV = float(0.5).sub(fract(rowCoord).sub(0.5).abs());
  const drawU = ddU.max(mU);
  const drawV = ddV.max(mV);
  const lineU = smoothstep(drawU.add(ddU), drawU.sub(ddU), distU).mul(float(mU).div(drawU).min(1));
  const lineV = smoothstep(drawV.add(ddV), drawV.sub(ddV), distV).mul(float(mV).div(drawV).min(1));
  const wallFacing = smoothstep(0.7, 0.45, nrm.y);
  const joint = lineU.max(lineV).mul(wallFacing);
  const brickKey = uint(courseRow.add(1 << 16)).mul(uint(73856093)).bitXor(uint(floor(colCoord).add(1 << 16)).mul(uint(19349663))).toVar();
  const brickRnd = ihash(brickKey);
  const brickRnd2 = ihash(brickKey.add(uint(1)));
  const bevel = 0.02;
  const texel = fwidth(positionWorld).length();
  const lodBevel = texel.mul(1.5).max(bevel);
  const brickFace = smoothstep(0, lodBevel, distU.mul(brickL)).mul(smoothstep(0, lodBevel, distV.mul(brickH))).mul(wallFacing);
  const reliefHeight = brickFace.mul(8e-3);
  const rough = mx_noise_float(positionWorld.mul(0.5)).mul(0.08).add(0.82).add(joint.mul(0.12));
  const partId = varying(attribute("partId", "float")).setInterpolation(InterpolationSamplingType.FLAT, InterpolationSamplingMode.EITHER);
  const isGlass = partId.equal(GLASS);
  const isFrame = partId.equal(FRAME);
  const isOrnament = partId.equal(ORNAMENT);
  const isAC = partId.equal(AC);
  const lighten = select(partId.equal(PIER), float(0.12), select(isOrnament, float(0.2), float(0)));
  const perBrick = float(1).add(tone).add(mottle).add(brickRnd.sub(0.5).mul(0.14));
  const warmCool = brickRnd2.sub(0.5).mul(0.14);
  const brickShift = vec3(float(1).add(warmCool), float(1), float(1).sub(warmCool));
  const tint = mix(buildingBase, color(16777215), lighten).mul(perBrick).mul(brickShift);
  const masonry = mix(tint, tint.mul(0.6), joint);
  const roofMask = wallFacing.oneMinus();
  const roofGrime = select(roofMask.greaterThan(0), smoothstep(0, 0.55, mx_fractal_noise_float(positionWorld.mul(0.025), 3)).mul(0.22), float(0));
  const stoneColor = mix(masonry, soot, mix(dirt, roofGrime, roofMask));
  const room = interior().toVar();
  const filmNoise = mx_fractal_noise_float(vec3(positionWorld.x.mul(1.3), positionWorld.y.mul(0.06), positionWorld.z.mul(1.3)), 2);
  const dustStreak = smoothstep(-0.15, 0.5, filmNoise).mul(0.45);
  const pooled = smoothstep(0.32, 0, uv().y).mul(0.4);
  const grime = float(0.64).add(dustStreak).add(pooled).clamp(0, 0.95);
  const dirtyGlass = mix(color(1250842), color(2304817), mx_noise_float(positionWorld.mul(0.3)).mul(0.5).add(0.5));
  const glassColor = mix(room.xyz.mul(color(11978431)), dirtyGlass, grime);
  const frameColor = buildingBase.mul(0.55);
  const ornamentColor = mix(buildingBase, color(16777215), 0.22).mul(float(1).add(tone));
  const acUv = uv();
  const acVent = smoothstep(0.65, 0.4, normalWorldGeometry.y.abs());
  const acDetail = smoothstep(0.08, 0.015, texel);
  const acLouver = acVent.mul(acDetail);
  const acDinge = mx_noise_float(positionWorld.mul(0.4)).mul(0.5).add(0.5);
  const acPaint = mix(color(15921644), color(13618370), acDinge).add(mx_noise_float(positionWorld.mul(5)).mul(0.04));
  const acGrille = smoothstep(0.06, 0.14, acUv.x).mul(smoothstep(0.94, 0.86, acUv.x)).mul(smoothstep(0.12, 0.2, acUv.y)).mul(smoothstep(0.96, 0.88, acUv.y)).mul(acLouver);
  const acSlats = fract(acUv.y.mul(6));
  const acFin = mix(float(0.82), float(1.04), acSlats);
  const acBody = acPaint.mul(mix(float(1), acFin.mul(0.42), acGrille));
  const acStreak = mx_fractal_noise_float(vec3(positionWorld.x.mul(6), positionWorld.y.mul(0.5), positionWorld.z.mul(6)), 3).mul(0.5).add(0.5);
  const acGrime = smoothstep(0.4, 0, acUv.y).mul(acStreak).mul(acDinge.add(0.3));
  const acColor = mix(acBody, color(7301210), acGrime.mul(0.5));
  const acRelief = acGrille.mul(acSlats.mul(0.012).sub(0.01));
  const acRough = float(0.52).add(acGrille.mul(0.08));
  const material = new MeshStandardNodeMaterial();
  material.colorNode = select(isGlass, glassColor, select(isFrame, frameColor, select(isOrnament, ornamentColor, select(isAC, acColor, stoneColor))));
  material.roughnessNode = select(isGlass, float(0.18), select(isOrnament, float(0.8), select(isAC, acRough, rough)));
  material.metalnessNode = float(0);
  material.emissiveNode = select(isGlass, room.xyz.mul(room.w).mul(4).mul(grime.mul(0.6).oneMinus()), color(0));
  material.normalNode = bumpNormal(select(isGlass.or(isFrame).or(isOrnament), float(0), select(isAC, acRelief, reliefHeight)));
  return material;
}
export { SkyscraperGenerator, createSkyscraperMaterial, buildingPalette, pickBuildingColor };
