import {
  DEG,
  clamp,
  dot,
  scale,
  sub,
  cross,
  length,
  axesFromSample
} from "./orientation.js";
const STORAGE_KEY = "openwii.calibration.v1";
let bootId = null;
export async function fetchBootId() {
  if (bootId) return bootId;
  try {
    const res = await fetch("/api/session");
    bootId = (await res.json()).bootId;
  } catch {
    bootId = "unknown";
  }
  return bootId;
}
export function saveCalibration(frame, result) {
  if (!frame) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ frame, result, bootId, at: Date.now() }));
  } catch {
  }
}
export function loadCalibration() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved.frame || !saved.frame.f) return null;
    if (!bootId || saved.bootId !== bootId) return null;
    return saved;
  } catch {
    return null;
  }
}
export function clearCalibration() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
  }
}
const SENSITIVITY_KEY = "openwii.sensitivity.v2";
export function saveSensitivity(v) {
  try {
    localStorage.setItem(SENSITIVITY_KEY, String(v));
  } catch {
  }
}
export function loadSensitivity() {
  try {
    const v = Number(localStorage.getItem(SENSITIVITY_KEY));
    return Number.isFinite(v) && v > 0 ? clamp(v, 0.2, 6) : null;
  } catch {
    return null;
  }
}
export const STEADY_MS = 1200;
const STEADY_KEEP_MS = STEADY_MS * 1.6;
const STEADY_GIVE_UP_MS = 6e3;
const COS_STEADY = Math.cos(5 * DEG);
export const CAL_STEPS = ["signal", "steady", "range", "done"];
export function measureNoise(buf, current) {
  let worst = 0;
  for (const s of buf) {
    const a = Math.acos(clamp(dot(s.y, current.y), -1, 1));
    const b = Math.acos(clamp(dot(s.z, current.z), -1, 1));
    worst = Math.max(worst, a, b);
  }
  return worst / DEG;
}
export function buildFrame(axes) {
  const useTopEdge = Math.abs(axes.y.z) <= Math.abs(axes.z.z);
  const f = useTopEdge ? axes.y : scale(axes.z, -1);
  let u = sub({ x: 0, y: 0, z: 1 }, scale(f, f.z));
  const ulen = length(u);
  if (ulen < 1e-3) return null;
  u = scale(u, 1 / ulen);
  return { f, u, r: cross(f, u), axis: useTopEdge ? "y" : "z", yaw0: 0, pitch0: 0 };
}
export function forwardOf(frame, axes) {
  return frame.axis === "y" ? axes.y : scale(axes.z, -1);
}
export function anglesIn(frame, fwd) {
  return {
    yaw: Math.atan2(dot(fwd, frame.r), dot(fwd, frame.f)) / DEG - frame.yaw0,
    pitch: Math.asin(clamp(dot(fwd, frame.u), -1, 1)) / DEG - frame.pitch0
  };
}
export class Calibration {
  constructor({ onStep = () => {
  }, onDone = () => {
  } } = {}) {
    this.onStep = onStep;
    this.onDone = onDone;
    this.active = false;
    this.done = false;
    this.step = "signal";
    this.stepSince = 0;
    this.steadyBuf = [];
    this.frame = null;
    this.range = { yawMin: 0, yawMax: 0, pitchMin: 0, pitchMax: 0 };
    this.noiseDeg = 0;
    this.lastSpan = 0;
    this.spanStillSince = 0;
    this.result = null;
  }
  start(now) {
    this.active = true;
    this.done = false;
    this.frame = null;
    this.steadyBuf.length = 0;
    this.setStep("signal", now);
  }
  setStep(step, now) {
    this.step = step;
    this.stepSince = now;
    this.onStep(step);
  }
  /** Feed one sample. Returns the frame once one exists, else null. */
  advance(sample, now) {
    const axes = axesFromSample(sample);
    if (!this.active) return this.frame;
    if (this.step === "signal") {
      this.setStep("steady", now);
      return this.frame;
    }
    if (this.step === "steady") {
      this.steadyBuf.push({ t: now, y: axes.y, z: axes.z });
      while (this.steadyBuf.length > 1 && now - this.steadyBuf[0].t > STEADY_KEEP_MS) {
        this.steadyBuf.shift();
      }
      const spans = this.steadyBuf.length >= 2 && now - this.steadyBuf[0].t >= STEADY_MS;
      const agrees = this.steadyBuf.every(
        (s) => dot(s.y, axes.y) > COS_STEADY && dot(s.z, axes.z) > COS_STEADY
      );
      const givenUp = now - this.stepSince > STEADY_GIVE_UP_MS;
      if (spans && agrees || givenUp) {
        const built = buildFrame(axes);
        if (built) {
          this.frame = built;
          this.noiseDeg = measureNoise(this.steadyBuf, axes);
          this.range = { yawMin: 0, yawMax: 0, pitchMin: 0, pitchMax: 0 };
          this.lastSpan = 0;
          this.spanStillSince = now;
          this.setStep("range", now);
        } else if (givenUp) {
          this.stepSince = now;
        }
      }
      return this.frame;
    }
    if (this.step === "range" && this.frame) {
      const { yaw, pitch } = anglesIn(this.frame, forwardOf(this.frame, axes));
      const r = this.range;
      r.yawMin = Math.min(r.yawMin, yaw);
      r.yawMax = Math.max(r.yawMax, yaw);
      r.pitchMin = Math.min(r.pitchMin, pitch);
      r.pitchMax = Math.max(r.pitchMax, pitch);
      const bothYaw = r.yawMin < -12 && r.yawMax > 12;
      const bothPitch = r.pitchMin < -7 && r.pitchMax > 7;
      const span = r.yawMax - r.yawMin + (r.pitchMax - r.pitchMin);
      if (span > this.lastSpan + 0.5) {
        this.lastSpan = span;
        this.spanStillSince = now;
      }
      const settled = now - (this.spanStillSince || now) > 900;
      const elapsed = now - this.stepSince;
      if (bothYaw && bothPitch && settled && elapsed > 3e3 || elapsed > 14e3) this.finish();
    }
    return this.frame;
  }
  finish() {
    const r = this.range;
    const noiseFloor = clamp(this.noiseDeg * 55, 20, 50);
    const hiX = Math.max(noiseFloor, 60);
    const hiY = Math.max(noiseFloor * 0.62, 40);
    const spanX = clamp(r.yawMax - r.yawMin, noiseFloor, hiX);
    const spanY = clamp(r.pitchMax - r.pitchMin, noiseFloor * 0.62, hiY);
    this.frame.yaw0 += (r.yawMin + r.yawMax) / 2;
    this.frame.pitch0 += (r.pitchMin + r.pitchMax) / 2;
    this.active = false;
    this.done = true;
    this.step = "done";
    this.result = {
      degPerScreenX: spanX * 0.6,
      degPerScreenY: spanY * 0.6,
      grip: this.frame.axis,
      noiseDeg: this.noiseDeg
    };
    saveCalibration(this.frame, this.result);
    this.onStep("done");
    this.onDone(this.result);
  }
  /** Re-zero the neutral pose from the current sample, keeping sensitivity. */
  recentre(sample) {
    const built = buildFrame(axesFromSample(sample));
    if (!built) return false;
    this.frame = built;
    saveCalibration(this.frame, this.result);
    return true;
  }
  /** Adopt a frame saved by an earlier page. Returns the stored result. */
  restore(saved) {
    if (!saved || !saved.frame) return null;
    this.frame = saved.frame;
    this.done = true;
    this.active = false;
    this.step = "done";
    this.result = saved.result || null;
    return this.result;
  }
  /** Adopt whatever we have and stop, for a player who skips the flow. */
  skip(sample) {
    if (!this.frame && sample) this.recentre(sample);
    this.active = false;
    this.done = true;
    this.step = "done";
    this.onStep("done");
    return this.frame;
  }
}
