export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const scale = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const length = (a) => Math.hypot(a.x, a.y, a.z);
export const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
});
export function bodyAxes(alpha, beta, gamma) {
  const z = alpha * DEG;
  const x = beta * DEG;
  const y = gamma * DEG;
  const cZ = Math.cos(z);
  const sZ = Math.sin(z);
  const cX = Math.cos(x);
  const sX = Math.sin(x);
  const cY = Math.cos(y);
  const sY = Math.sin(y);
  return {
    x: { x: cZ * cY - sZ * sX * sY, y: sZ * cY + cZ * sX * sY, z: -cX * sY },
    y: { x: -sZ * cX, y: cZ * cX, z: sX },
    z: { x: cZ * sY + sZ * sX * cY, y: sZ * sY - cZ * sX * cY, z: cX * cY }
  };
}
export function bodyAxesFromQuat(q) {
  const [x, y, z, w] = q;
  return {
    x: { x: 1 - 2 * (y * y + z * z), y: 2 * (x * y + z * w), z: 2 * (x * z - y * w) },
    y: { x: 2 * (x * y - z * w), y: 1 - 2 * (x * x + z * z), z: 2 * (y * z + x * w) },
    z: { x: 2 * (x * z + y * w), y: 2 * (y * z - x * w), z: 1 - 2 * (x * x + y * y) }
  };
}
export function axesFromSample(sample) {
  return sample.quat ? bodyAxesFromQuat(sample.quat) : bodyAxes(sample.alpha || 0, sample.beta || 0, sample.gamma || 0);
}
export function angleDelta(a, b) {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}
export function gripTilt(axes) {
  const beamY = axes.y;
  const beamZ = scale(axes.z, -1);
  const fwd = Math.abs(beamY.z) <= Math.abs(beamZ.z) ? beamY : beamZ;
  return {
    bank: -Math.asin(clamp(axes.x.z, -1, 1)) / DEG,
    pitch: Math.asin(clamp(fwd.z, -1, 1)) / DEG
  };
}
