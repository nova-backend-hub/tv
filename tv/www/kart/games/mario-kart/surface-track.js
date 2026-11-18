import { createMeshSurface } from "./surface-mesh.js";
import { wheelSupport } from "./wheel-support.js";
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mul = (v, s) => ({ x: v.x * s, y: v.y * s, z: v.z * s });
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const unit = (v) => mul(v, 1 / (Math.hypot(v.x, v.y, v.z) || 1));
const mix = (a, b, t) => add(mul(a, 1 - t), mul(b, t));
const vector = (a) => ({ x: a[0], y: a[1], z: a[2] });
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrap = (x, L) => (x % L + L) % L;
function rotate(v, n, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return add(add(mul(v, c), mul(cross(n, v), s)), mul(n, dot(n, v) * (1 - c)));
}
function transport(v, a, b) {
  const axis = cross(a, b), s = Math.hypot(axis.x, axis.y, axis.z), c = clamp(dot(a, b), -1, 1);
  const result = s > 1e-9 ? rotate(v, mul(axis, 1 / s), Math.atan2(s, c)) : v;
  return unit(sub(result, mul(b, dot(result, b))));
}
export function createSurfaceTrack(data) {
  var _a;
  const mesh = data.roadMesh ? createMeshSurface(data.roadMesh) : null;
  if (!Array.isArray(data.points) || data.points.length < 4 || !(data.length > 0)) throw new Error("Invalid measured road");
  const rows = data.points.map((row) => {
    if (![row.s, ...row.p, ...row.n].every(Number.isFinite)) throw new Error("Non-finite measured road");
    return { s: row.s, p: vector(row.p), n: unit(vector(row.n)) };
  });
  for (let i = 1; i < rows.length; i++) if (rows[i].s <= rows[i - 1].s) throw new Error("Road distance must increase");
  const length = data.length, count = rows.length - 1;
  if (Math.abs(rows.at(-1).s - length) > 1e-5 || rows[0].s !== 0) throw new Error("Road must cover one complete lap");
  function index(s) {
    let lo = 0, hi = count - 1;
    while (lo < hi) {
      const m = Math.ceil((lo + hi) / 2);
      if (rows[m].s <= s) lo = m;
      else hi = m - 1;
    }
    return lo;
  }
  function sample(distance) {
    const s = wrap(distance, length), i = index(s), a = rows[i], b = rows[i + 1], t = (s - a.s) / (b.s - a.s);
    return { p: mix(a.p, b.p, t), n: unit(mix(a.n, b.n, t)), s };
  }
  function at(distance) {
    const { p, n, s } = sample(distance), a = sample(s - 0.4).p, b = sample(s + 0.4).p;
    const along = unit(sub(b, a)), forward = unit(sub(along, mul(n, dot(along, n)))), right = unit(cross(forward, n));
    const h = Math.hypot(forward.x, forward.z) || 1;
    return {
      ...p,
      s,
      tx: forward.x / h,
      tz: forward.z / h,
      heading: Math.atan2(forward.x, -forward.z),
      rx: right.x,
      ry: right.y,
      rz: right.z,
      normal: n,
      forward,
      right,
      bank: Math.atan2(right.y, Math.hypot(right.x, right.z)),
      anti: s >= data.antiStart && s < data.antiEnd,
      glide: s >= data.gapStart && s < data.gapEnd,
      control: s / length * 27
    };
  }
  function surface(distance, lateral = 0) {
    const p = at(distance), q = add(p, mul(p.right, lateral));
    const hit = mesh && !p.glide ? mesh.sample(q, p.normal) : null;
    return { ...p, x: q.x, y: q.y, z: q.z, ...hit };
  }
  const boundCache = /* @__PURE__ */ new Map();
  function bounds(distance, lateral = 0) {
    const p = at(distance), fallback = { min: -(data.roadHalf ?? 9.525), max: data.roadHalf ?? 9.525 };
    if (!mesh || p.glide) return fallback;
    const i = index(p.s), t = (p.s - rows[i].s) / (rows[i + 1].s - rows[i].s);
    const atRow = (j) => {
      j %= count;
      if (!boundCache.has(j)) {
        const q = at(rows[j].s);
        boundCache.set(j, mesh.limits(q, q.normal, q.right, q.forward));
      }
      const choices = boundCache.get(j);
      if (!choices.length) return fallback;
      const interval = choices.reduce((a2, b2) => Math.abs(clamp(0, ...b2)) < Math.abs(clamp(0, ...a2)) ? b2 : a2);
      return { min: interval[0], max: interval[1] };
    };
    const a = atRow(i), b = atRow(i + 1);
    return { min: a.min * (1 - t) + b.min * t, max: a.max * (1 - t) + b.max * t };
  }
  function wallBounds(s, lateral = 0) {
    if (!mesh) return { min: -(data.wallHalf ?? 14.5), max: data.wallHalf ?? 14.5 };
    const p = bounds(s, lateral);
    return { min: p.min - 0.75, max: p.max + 0.75 };
  }
  function contact(s, lateral, point) {
    return point ? mesh == null ? void 0 : mesh.sample(point, point.surfaceNormal || at(s).normal) : surface(s, lateral);
  }
  function onRoad(s, lateral, point = null) {
    var _a2;
    return mesh ? !!((_a2 = contact(s, lateral, point)) == null ? void 0 : _a2.onRoad) : Math.abs(lateral) <= (data.roadHalf ?? 9.525) + 0.2;
  }
  function constrainLateral(r, lateral) {
    const path = at(r.s), destination = add(r, mul(path.right, lateral - r.lateral));
    return mesh && mesh.sample(destination, r.surfaceNormal || path.normal) || surface(r.s, lateral);
  }
  function project(point, previousS = null, flat = false) {
    const center = previousS === null ? 0 : index(wrap(previousS, length));
    const span = previousS === null ? count : Math.min(count, 113);
    let best;
    for (let j = 0; j < span; j++) {
      const i = previousS === null ? j : wrap(center + j - Math.floor(span / 2), count), a = rows[i], b = rows[i + 1];
      const delta = sub(b.p, a.p), offset2 = sub(point, a.p);
      const l2 = delta.x * delta.x + delta.z * delta.z + (flat ? 0 : delta.y * delta.y);
      const t = clamp((offset2.x * delta.x + offset2.z * delta.z + (flat ? 0 : offset2.y * delta.y)) / Math.max(l2, 1e-12), 0, 1);
      const on = mix(a.p, b.p, t), d = sub(point, on), d2 = d.x * d.x + d.z * d.z + (flat ? 0 : d.y * d.y);
      if (!best || d2 < best.d2) best = { s: a.s + (b.s - a.s) * t, d2, on };
    }
    const frame2 = at(best.s), offset = sub(point, best.on);
    const lateral = flat ? offset.x * -frame2.tz + offset.z * frame2.tx : dot(offset, frame2.right);
    return { s: wrap(best.s, length), lateral, d2: best.d2 };
  }
  function frame(s, heading, lateral = 0, direction = null, normal = null) {
    const p = at(s), x = Math.sin(heading), z = -Math.cos(heading);
    const up = normal || (mesh ? surface(s, lateral).normal : p.normal);
    if (direction) {
      const forward2 = unit(sub(direction, mul(up, dot(direction, up))));
      return { up, forward: forward2, right: unit(cross(forward2, up)) };
    }
    const y = -(p.normal.x * x + p.normal.z * z) / (Math.abs(p.normal.y) > 1e-5 ? p.normal.y : 1e-5);
    const forward = transport(unit({ x, y, z }), p.normal, up);
    return { up, forward, right: unit(cross(forward, up)) };
  }
  function turn(r, amount) {
    const f = frame(r.s, r.heading, r.lateral, r.surfaceForward, r.surfaceNormal), v = rotate(f.forward, f.up, -amount);
    return { surfaceForward: v, heading: Math.atan2(v.x, -v.z) };
  }
  function turnHeading(s, heading, turn2) {
    const f = frame(s, heading), v = rotate(f.forward, f.up, -turn2);
    return Math.atan2(v.x, -v.z);
  }
  function steeringError(r, target) {
    if (r.gliding) return Math.atan2(Math.sin(Math.atan2(target.x - r.x, -(target.z - r.z)) - r.heading), Math.cos(Math.atan2(target.x - r.x, -(target.z - r.z)) - r.heading));
    const f = frame(r.s, r.heading, r.lateral, r.surfaceForward, r.surfaceNormal), direction = unit(sub(sub(target, r), mul(f.up, dot(sub(target, r), f.up))));
    return Math.atan2(dot(direction, f.right), dot(direction, f.forward));
  }
  function advance(r, turn2, distance, lateralDistance = 0) {
    var _a2;
    const current = frame(r.s, r.heading, r.lateral, r.surfaceForward, r.surfaceNormal), direction = rotate(current.forward, current.up, -turn2);
    const destination = add(add(r, mul(direction, distance)), mul(current.right, lateralDistance)), near = project(destination, r.s);
    const next = mesh && mesh.sample(destination, current.up) || surface(near.s, near.lateral);
    const position = mesh ? project(next, r.s) : near;
    const normal = ((_a2 = mesh && wheelSupport(mesh.sample, next, current.up, direction)) == null ? void 0 : _a2.normal) || next.normal;
    const forward = transport(direction, current.up, normal);
    return { ...position, x: next.x, y: next.y, z: next.z, heading: Math.atan2(forward.x, -forward.z), surfaceForward: forward, surfaceNormal: normal, verticalSpeedRatio: direction.y };
  }
  return {
    length,
    hasRoadMesh: !!mesh,
    roadHalf: data.roadHalf ?? 9.525,
    wallHalf: data.wallHalf ?? 14.5,
    at,
    surface,
    bounds,
    wallBounds,
    onRoad,
    constrainLateral,
    project,
    frame,
    steeringError,
    turnHeading,
    turn,
    advance,
    onBoost: (s, lateral, point = null) => {
      var _a2;
      return !!(mesh && ((_a2 = contact(s, lateral, point)) == null ? void 0 : _a2.onBoost));
    },
    support: (point, normal) => (mesh == null ? void 0 : mesh.sample(point, normal)) || null,
    sections: { antiStart: data.antiStart, antiEnd: data.antiEnd, glideStart: data.gapStart, glideEnd: data.gapEnd },
    samples: rows.slice(0, -1).map((row) => ({ ...row.p, s: row.s, control: row.s / length * 27 })),
    boostPads: Array.isArray((_a = data.roadMesh) == null ? void 0 : _a.boost) ? [] : data.boostPads ?? [0.195, 0.215, 0.235, 0.86, 0.89, 0.915].map((t, i) => ({ s: t * length, lateral: i < 3 ? -5.5 : 5.5, width: 4, length: 7 })),
    itemRows: [0.13, 0.48, 0.72].flatMap((t) => [-6, 0, 6].map((lateral) => ({ s: t * length, lateral }))),
    coinSpots: [0.05, 0.17, 0.3, 0.39, 0.49, 0.59, 0.67, 0.76, 0.86, 0.95].flatMap((t, i) => [-3, 0, 3].map((d) => ({ s: t * length + d, lateral: i % 2 ? 5 : -3 })))
  };
}
