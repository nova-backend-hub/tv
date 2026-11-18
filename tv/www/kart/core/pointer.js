import { clamp, dot, cross, scale, length, axesFromSample, DEG } from "./orientation.js";
const norm = (v) => {
  const L = length(v) || 1;
  return { x: v.x / L, y: v.y / L, z: v.z / L };
};
const wrapDeg = (a) => {
  let d = a;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
};
function omegaFromAttitudes(a1, a2, dt) {
  const col = (a, k) => [a[k].x, a[k].y, a[k].z];
  const R1 = [col(a1, "x"), col(a1, "y"), col(a1, "z")];
  const R2 = [col(a2, "x"), col(a2, "y"), col(a2, "z")];
  const M = [0, 1, 2].map((i) => [0, 1, 2].map(
    (j) => R1[i][0] * R2[j][0] + R1[i][1] * R2[j][1] + R1[i][2] * R2[j][2]
  ));
  return {
    x: (M[2][1] - M[1][2]) / (2 * dt) / DEG,
    y: (M[0][2] - M[2][0]) / (2 * dt) / DEG,
    z: (M[1][0] - M[0][1]) / (2 * dt) / DEG
  };
}
const AXES = ["x", "y", "z"];
export class Pointer {
  constructor(options = {}) {
    this.sensitivity = options.sensitivity ?? 1;
    this.degPerScreen = options.degPerScreen ?? 20;
    this.aspect = options.aspect ?? 0.6;
    this.invertX = false;
    this.invertY = false;
    this.deadzoneDps = options.deadzoneDps ?? 0.3;
    this.fallbackDeadzoneDps = options.fallbackDeadzoneDps ?? 4;
    this.pos = { x: 0.5, y: 0.5 };
    this.rate = { x: 0, y: 0 };
    this.rateDps = { yaw: 0, pitch: 0 };
    this.displayLead = options.displayLead ?? true;
    this.emaPacketDt = 1 / 60;
    this.leadTau = 0.02;
    this.emaRate = { x: 0, y: 0 };
    this.emaAbsDps = 0;
    this.yawOffDeg = 0;
    this.pitchOffDeg = 0;
    this.overshoot = options.overshoot ?? 0.15;
    this.refAz = null;
    this.refElev = null;
    this.usedBeam = null;
    this.fwdBeam = null;
    this.stillMs = 0;
    this.healTau = options.healTau ?? 1.2;
    this.prevAxes = null;
    this.emaO = { x: 0, y: 0, z: 0 };
    this.emaTau = 0.08;
    this.ring = [];
    this.C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    this.absO = [0, 0, 0];
    this.absR = [0, 0, 0];
    this.map = [null, null, null];
    this.emaM = { x: 0, y: 0, z: 0 };
    this.resBad = 0;
    this.resAll = 0;
    this.gyroTrusted = false;
    this.live = false;
    this.lastSeen = 0;
    this.lastDraw = 0;
    this.hasGyro = false;
    this.mode = "gyro-rate";
    this.source = "\u2014";
    this.w = 1;
    this.h = 1;
  }
  get display() {
    return this.pos;
  }
  get position() {
    return this.pos;
  }
  get pixels() {
    return { x: this.pos.x * this.w, y: this.pos.y * this.h };
  }
  setViewport(w, h) {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
  }
  recentre() {
    this.pos.x = 0.5;
    this.pos.y = 0.5;
    this.rate.x = 0;
    this.rate.y = 0;
    this.yawOffDeg = 0;
    this.pitchOffDeg = 0;
    this.refAz = null;
    this.refElev = null;
  }
  setFromMouse(nx, ny) {
    this.pos.x = clamp(nx, 0, 1);
    this.pos.y = clamp(ny, 0, 1);
    this.rate.x = 0;
    this.rate.y = 0;
    const sx = this.sensitivity * (this.invertX ? -1 : 1) || 1;
    const sy = this.sensitivity * (this.invertY ? -1 : 1) || 1;
    this.yawOffDeg = (0.5 - this.pos.x) * this.degPerScreen / sx;
    this.pitchOffDeg = (0.5 - this.pos.y) * this.degPerScreen * this.aspect / sy;
    this.refAz = null;
    this.refElev = null;
  }
  /** One-line summary of the learned device map, for the debug overlay. */
  describeMap() {
    if (!this.hasGyro) return "no gyro \u2014 orientation only";
    if (!this.gyroTrusted) return "learning (orientation fallback)";
    return this.map.map((m, i) => m ? `${AXES[i]}\u2190${AXES[m.col]}${m.sign > 0 ? "+" : "\u2212"}${m.scale.toFixed(m.scale > 5 ? 0 : 2)}` : `${AXES[i]}\u2205`).join(" ");
  }
  /** Feed one packet from the phone. `dt` = seconds since the previous one. */
  update(sample, dt, now = 0) {
    const axes = axesFromSample(sample);
    this.source = sample.quat ? "quaternion" : "euler";
    this.live = true;
    this.lastSeen = now;
    if (dt > 0 && dt < 0.1) this.emaPacketDt += (dt - this.emaPacketDt) * 0.1;
    let omegaTrue = { x: 0, y: 0, z: 0 };
    if (this.prevAxes && dt > 0 && dt < 0.1) {
      omegaTrue = omegaFromAttitudes(this.prevAxes, axes, dt);
      const k2 = clamp(dt / this.emaTau, 0, 1);
      this.emaO.x += (omegaTrue.x - this.emaO.x) * k2;
      this.emaO.y += (omegaTrue.y - this.emaO.y) * k2;
      this.emaO.z += (omegaTrue.z - this.emaO.z) * k2;
    }
    this.prevAxes = axes;
    const m = sample.motion;
    const r = m ? [m.rx || 0, m.ry || 0, m.rz || 0] : null;
    if (r && (r[0] || r[1] || r[2])) this.hasGyro = true;
    if (r && this.hasGyro && dt > 0 && dt < 0.1) {
      this.ring.push(r);
      const delaySlots = Math.max(1, Math.round(0.05 / Math.max(dt, 1 / 240)));
      while (this.ring.length > delaySlots + 1) this.ring.shift();
      const rDel = this.ring[0];
      const moving = length(this.emaO) > 10;
      if (moving && rDel) {
        const decay = Math.exp(-dt / 30);
        const t = [this.emaO.x, this.emaO.y, this.emaO.z];
        for (let i = 0; i < 3; i += 1) {
          this.absO[i] = this.absO[i] * decay + Math.abs(t[i]) * dt;
          this.absR[i] = this.absR[i] * decay + Math.abs(rDel[i]) * dt;
          for (let j = 0; j < 3; j += 1) {
            this.C[i][j] = this.C[i][j] * decay + t[i] * rDel[j] * dt;
          }
        }
        const maxAbsO = Math.max(...this.absO, 1e-9);
        const order = [0, 1, 2].sort((a, b) => this.absO[b] - this.absO[a]);
        const taken = /* @__PURE__ */ new Set();
        const newMap = [null, null, null];
        for (const i of order) {
          const prev = this.map[i];
          const avail = this.C[i].map((v, j) => taken.has(j) ? 0 : Math.abs(v));
          const best = avail.indexOf(Math.max(...avail));
          const second = Math.max(...[0, 1, 2].filter((j) => j !== best).map((j) => Math.abs(this.C[i][j])));
          const decisive = avail[best] > 2 * second && this.absR[best] > 1e-9;
          const eligible = this.absO[i] >= 15 && this.absO[i] >= 0.15 * maxAbsO;
          if (prev && !taken.has(prev.col) && !(decisive && best !== prev.col && eligible)) {
            const sign = Math.sign(this.C[i][prev.col]) || prev.sign;
            newMap[i] = {
              col: prev.col,
              sign,
              scale: this.absO[i] / Math.max(this.absR[prev.col], 1e-9)
            };
            taken.add(prev.col);
          } else if (eligible && decisive) {
            newMap[i] = {
              col: best,
              sign: Math.sign(this.C[i][best]),
              scale: this.absO[i] / Math.max(this.absR[best], 1e-9)
            };
            taken.add(best);
          }
        }
        this.map = newMap;
        const shape = this.map.map((mm) => mm ? `${mm.col}${mm.sign > 0 ? "+" : "-"}` : "-");
        const shapeKey = shape.join("");
        if (shapeKey !== this.mapShape) {
          this.mapShape = shapeKey;
          this.resBad = 0;
          this.resAll = 0;
        }
        const mapped = this.applyMap(rDel);
        const km = clamp(dt / this.emaTau, 0, 1);
        this.emaM.x += (mapped.x - this.emaM.x) * km;
        this.emaM.y += (mapped.y - this.emaM.y) * km;
        this.emaM.z += (mapped.z - this.emaM.z) * km;
        const err2 = Math.hypot(this.emaM.x - this.emaO.x, this.emaM.y - this.emaO.y, this.emaM.z - this.emaO.z);
        this.resBad = this.resBad * decay + err2 * dt;
        this.resAll = this.resAll * decay + length(this.emaO) * dt;
        const pitchClaimed = this.map[0] !== null;
        const yawClaimed = this.map[1] !== null || this.map[2] !== null;
        this.gyroTrusted = pitchClaimed && yawClaimed && this.resAll > 1 && this.resBad / this.resAll < 0.6;
      }
    }
    let omega;
    let deadzone;
    if (this.gyroTrusted && r) {
      omega = this.applyMap(r);
      deadzone = this.deadzoneDps;
    } else {
      omega = this.emaO;
      deadzone = this.fallbackDeadzoneDps;
    }
    const omegaW = {
      x: axes.x.x * omega.x + axes.y.x * omega.y + axes.z.x * omega.z,
      y: axes.x.y * omega.x + axes.y.y * omega.y + axes.z.y * omega.z,
      z: axes.x.z * omega.x + axes.y.z * omega.y + axes.z.z * omega.z
    };
    const beamY = axes.y;
    const beamZ = scale(axes.z, -1);
    let fwd;
    if (this.fwdBeam === "y") fwd = Math.abs(beamZ.z) + 0.35 < Math.abs(beamY.z) ? beamZ : beamY;
    else if (this.fwdBeam === "z") fwd = Math.abs(beamY.z) + 0.35 < Math.abs(beamZ.z) ? beamY : beamZ;
    else fwd = Math.abs(beamY.z) <= Math.abs(beamZ.z) ? beamY : beamZ;
    this.fwdBeam = fwd === beamY ? "y" : "z";
    const right = norm(cross(fwd, { x: 0, y: 0, z: 1 }));
    let yawDps = omegaW.z;
    let pitchDps = dot(omegaW, right);
    if (Math.abs(yawDps) < deadzone) yawDps = 0;
    if (Math.abs(pitchDps) < deadzone) pitchDps = 0;
    this.rateDps = { yaw: yawDps, pitch: pitchDps };
    const az = Math.atan2(fwd.y, fwd.x) / DEG;
    const elev = Math.asin(clamp(fwd.z, -1, 1)) / DEG;
    const beamId = this.fwdBeam;
    if (this.refAz === null || this.usedBeam !== beamId) {
      this.refAz = az - this.yawOffDeg;
      this.refElev = elev - this.pitchOffDeg;
      this.usedBeam = beamId;
    }
    const errX = wrapDeg(az - this.refAz) - this.yawOffDeg;
    const errY = elev - this.refElev - this.pitchOffDeg;
    const err = Math.hypot(errX, errY);
    const rateNow = Math.max(Math.abs(yawDps), Math.abs(pitchDps));
    this.stillMs = rateNow < 12 ? this.stillMs + dt * 1e3 : 0;
    let tau = this.stillMs > 400 ? this.healTau * (1 + 3 * (rateNow / 12)) : 8;
    if (rateNow < 40 && err > 3 + rateNow * 0.12) tau = Math.min(tau, 1.5);
    const k = rateNow >= 40 ? 0 : clamp(dt / tau, 0, 1);
    this.yawOffDeg += errX * k;
    this.pitchOffDeg += errY * k;
    const sx = this.sensitivity * (this.invertX ? -1 : 1);
    const sy = this.sensitivity * (this.invertY ? -1 : 1);
    this.rate.x = -yawDps / this.degPerScreen * sx;
    this.rate.y = -pitchDps / (this.degPerScreen * this.aspect) * sy;
    const kE = 1 - Math.exp(-dt / this.leadTau);
    this.emaRate.x += (this.rate.x - this.emaRate.x) * kE;
    this.emaRate.y += (this.rate.y - this.emaRate.y) * kE;
    this.emaAbsDps += (Math.max(Math.abs(yawDps), Math.abs(pitchDps)) - this.emaAbsDps) * kE;
  }
  /** Reported gyro → true body rates through the learned map. */
  applyMap(r) {
    const out = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 3; i += 1) {
      const mm = this.map[i];
      out[AXES[i]] = mm ? mm.sign * mm.scale * r[mm.col] : 0;
    }
    return out;
  }
  /**
   * Where to draw the cursor this frame. Integrates the current angular rate
   * at display rate, so motion is continuous regardless of packet rate. The
   * integrated state is angular, bounded `overshoot` screens past each edge;
   * the visible position is the clamped view of it.
   */
  sampleAt(now) {
    if (!this.lastDraw) this.lastDraw = now;
    let dt = (now - this.lastDraw) / 1e3;
    this.lastDraw = now;
    if (!(dt > 0) || dt > 0.25) dt = 0;
    if (this.live && now - this.lastSeen < 250) {
      this.yawOffDeg += this.rateDps.yaw * dt;
      this.pitchOffDeg += this.rateDps.pitch * dt;
      const sx = this.sensitivity * (this.invertX ? -1 : 1);
      const sy = this.sensitivity * (this.invertY ? -1 : 1);
      const capX = (0.5 + this.overshoot) * this.degPerScreen / Math.max(Math.abs(sx), 1e-6);
      const capY = (0.5 + this.overshoot) * this.degPerScreen * this.aspect / Math.max(Math.abs(sy), 1e-6);
      this.yawOffDeg = clamp(this.yawOffDeg, -capX, capX);
      this.pitchOffDeg = clamp(this.pitchOffDeg, -capY, capY);
      this.pos.x = clamp(0.5 - this.yawOffDeg * sx / this.degPerScreen, 0, 1);
      this.pos.y = clamp(0.5 - this.pitchOffDeg * sy / (this.degPerScreen * this.aspect), 0, 1);
      if (this.displayLead) {
        const ramp = clamp((this.emaAbsDps - 18) / 32, 0, 1);
        if (ramp > 0) {
          const horizon = Math.min(
            clamp(this.emaPacketDt + 8e-3, 0.012, 0.035) + this.leadTau,
            0.055
          );
          const lead = horizon * ramp;
          this.pos.x = clamp(this.pos.x + this.emaRate.x * lead, 0, 1);
          this.pos.y = clamp(this.pos.y + this.emaRate.y * lead, 0, 1);
        }
      }
    }
    return this.pos;
  }
}
export const MODES = ["gyro-rate"];
