export function wheelSupport(sample, point, up, forward) {
  const right = { x: forward.y * up.z - forward.z * up.y, y: forward.z * up.x - forward.x * up.z, z: forward.x * up.y - forward.y * up.x };
  const hits = [];
  for (const along2 of [0.87, -0.9]) for (const side2 of [-0.99, 0.99]) {
    const origin = { x: point.x + right.x * side2 + forward.x * along2, y: point.y + right.y * side2 + forward.y * along2, z: point.z + right.z * side2 + forward.z * along2 };
    const hit = sample(origin, up);
    if (!hit || Math.abs((hit.x - origin.x) * up.x + (hit.y - origin.y) * up.y + (hit.z - origin.z) * up.z) > 0.92) return null;
    hits.push(hit);
  }
  const [fl, fr, rl, rr] = hits;
  const side = {}, along = {};
  for (const k of ["x", "y", "z"]) {
    side[k] = (fr[k] + rr[k] - fl[k] - rl[k]) / 2;
    along[k] = (fl[k] + fr[k] - rl[k] - rr[k]) / 2;
  }
  const n = { x: side.y * along.z - side.z * along.y, y: side.z * along.x - side.x * along.z, z: side.x * along.y - side.y * along.x };
  const length = Math.hypot(n.x, n.y, n.z);
  if (length < 1e-6) return null;
  const sign = n.x * up.x + n.y * up.y + n.z * up.z < 0 ? -1 : 1;
  return { normal: { x: n.x / length * sign, y: n.y / length * sign, z: n.z / length * sign }, hits };
}
