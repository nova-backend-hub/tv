export class SwingDetector {
  constructor({
    onThreshold = 150,
    // deg/s to arm a swing
    offThreshold = 60,
    // deg/s at which the swing has ended
    minTravel = 25,
    // degrees of angular travel to count at all
    maxMs = 500
    // longer than this is a gesture, not a swing
  } = {}) {
    this.onThreshold = onThreshold;
    this.offThreshold = offThreshold;
    this.minTravel = minTravel;
    this.maxMs = maxMs;
    this.active = false;
    this.startedAt = 0;
    this.travel = 0;
    this.peak = 0;
    this.vx = 0;
    this.vy = 0;
  }
  /**
   * Feed one rate sample. Returns a swing {angle, peak, travel, durationMs}
   * when one completes, else null.
   */
  update({ yaw = 0, pitch = 0 }, dt, now) {
    const mag = Math.hypot(yaw, pitch);
    const cx = -yaw;
    const cy = -pitch;
    if (!this.active) {
      if (mag >= this.onThreshold) {
        this.active = true;
        this.startedAt = now;
        this.travel = mag * dt;
        this.peak = mag;
        this.vx = cx * dt;
        this.vy = cy * dt;
      }
      return null;
    }
    this.travel += mag * dt;
    this.peak = Math.max(this.peak, mag);
    this.vx += cx * dt;
    this.vy += cy * dt;
    const tooLong = now - this.startedAt > this.maxMs;
    if (mag < this.offThreshold || tooLong) {
      this.active = false;
      if (this.travel >= this.minTravel && !tooLong) {
        return {
          angle: Math.atan2(this.vy, this.vx),
          peak: this.peak,
          travel: this.travel,
          durationMs: now - this.startedAt
        };
      }
      return null;
    }
    return null;
  }
}
export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}
export function lineDiff(a, b) {
  let d = Math.abs(angleDiff(a, b));
  if (d > Math.PI / 2) d = Math.PI - d;
  return d;
}
