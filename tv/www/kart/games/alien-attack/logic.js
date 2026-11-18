export const LANE_HALF = 12;
export const LATERAL_SPEED = 13;
export const STEER_FULL = 18;
export const SHIP_SPEED = 22;
export const SHIP_SPEED_MAX = 34;
export const SHIP_R = 1.1;
export const ALIEN_R = 1.3;
export const BOLT_REL_SPEED = 60;
export const BOLT_RANGE = 130;
export const FIRE_COOLDOWN_MS = 140;
export const ALIEN_BOLT_SPEED = 26;
export const ALIEN_FIRE_RANGE = 95;
export const ALIEN_FIRE_MS = 1700;
export const SPAWN_MS_START = 1400;
export const SPAWN_MS_MIN = 550;
export const SPAWN_AHEAD = 140;
export const LIVES = 3;
export const INVULN_MS = 1500;
export const KILL_POINTS = 100;
const DEG = Math.PI / 180;
const clamp1 = (v) => v < -1 ? -1 : v > 1 ? 1 : v;
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function captureTray(axes, prevRight = null) {
  const vx = -axes.z.x;
  const vy = -axes.z.y;
  const m = Math.hypot(vx, vy);
  let right = prevRight || { x: 1, y: 0 };
  if (m > 0.05) right = { x: vy / m, y: -vx / m };
  const sy = axes.y.x * right.x + axes.y.y * right.y >= 0 ? 1 : -1;
  const ref = { right, sy, bank0: 0 };
  ref.bank0 = trayRead(axes, ref).bank;
  return ref;
}
export function trayRead(axes, ref) {
  const rightEndZ = ref.sy * axes.y.z;
  return { bank: -Math.asin(clamp1(rightEndZ)) / DEG - ref.bank0 };
}
export const STEER_DEADZONE = 2.5;
export const BIAS_HEAL_BAND = 4.5;
export const BIAS_HEAL_TAU_S = 6;
export const BIAS_SETTLE_S = 2;
export const BIAS_SETTLE_TAU_S = 0.6;
export function shapeSteer(bankDeg) {
  const a = Math.abs(bankDeg);
  if (a <= STEER_DEADZONE) return 0;
  const sign = bankDeg < 0 ? -1 : 1;
  return sign * (a - STEER_DEADZONE) * (STEER_FULL / (STEER_FULL - STEER_DEADZONE));
}
export class SteerFilter {
  constructor() {
    this.bias = 0;
    this.ageS = 0;
  }
  update(rawBank, dt) {
    this.ageS += dt;
    const corrected = rawBank - this.bias;
    if (Math.abs(corrected) < BIAS_HEAL_BAND) {
      const tau = this.ageS < BIAS_SETTLE_S ? BIAS_SETTLE_TAU_S : BIAS_HEAL_TAU_S;
      this.bias += Math.min(1, dt / tau) * (rawBank - this.bias);
    }
    return shapeSteer(corrected);
  }
}
export class Patrol {
  constructor({ onEvent = () => {
  }, seed = 17 } = {}) {
    this.onEvent = onEvent;
    this.rng = mulberry32(seed);
    this.state = "ready";
    this.x = 0;
    this.z = 0;
    this.speed = 0;
    this.steer = 0;
    this.lives = LIVES;
    this.kills = 0;
    this.aliens = [];
    this.bolts = [];
    this.alienBolts = [];
    this.startMs = 0;
    this.timeMs = 0;
    this.lastFireMs = -Infinity;
    this.invulnUntil = 0;
    this.nextSpawnMs = 0;
    this.nextId = 1;
  }
  start(now) {
    const fresh = new Patrol({ onEvent: this.onEvent, seed: this.rng() * 2 ** 31 | 0 });
    Object.assign(this, fresh);
    this.state = "running";
    this.speed = SHIP_SPEED;
    this.startMs = now;
    this.nextSpawnMs = now + 700;
  }
  get score() {
    return this.kills * KILL_POINTS + Math.floor(this.z);
  }
  setSteer(bankDeg) {
    this.steer = bankDeg;
  }
  shoot(now) {
    if (this.state !== "running") return false;
    if (now - this.lastFireMs < FIRE_COOLDOWN_MS) return false;
    this.lastFireMs = now;
    this.bolts.push({ x: this.x, z: this.z + 2, born: this.z });
    this.onEvent({ type: "fire" });
    return true;
  }
  spawnAlien(now) {
    const a = {
      id: this.nextId++,
      x0: (this.rng() * 2 - 1) * (LANE_HALF - 1.5),
      x: 0,
      z: this.z + SPAWN_AHEAD,
      speed: 9 + this.rng() * 5 + Math.min(8, (now - this.startMs) / 12e3),
      swayAmp: this.rng() * 3.5,
      swayHz: 0.25 + this.rng() * 0.5,
      phase: this.rng() * Math.PI * 2,
      bornMs: now,
      nextFireMs: now + 600 + this.rng() * ALIEN_FIRE_MS
    };
    a.x = a.x0;
    this.aliens.push(a);
    this.onEvent({ type: "spawn", alien: a });
    return a;
  }
  loseLife(now, cause) {
    if (now < this.invulnUntil) return;
    this.lives -= 1;
    this.invulnUntil = now + INVULN_MS;
    this.onEvent({ type: "hit", cause, lives: this.lives });
    if (this.lives <= 0) {
      this.state = "done";
      this.onEvent({
        type: "done",
        score: this.score,
        kills: this.kills,
        distanceM: Math.floor(this.z),
        timeMs: this.timeMs
      });
    }
  }
  update(now, dt) {
    if (this.state !== "running") return;
    const elapsedS = (now - this.startMs) / 1e3;
    this.speed = Math.min(SHIP_SPEED_MAX, SHIP_SPEED + elapsedS * 0.12);
    const lock = Math.max(-1, Math.min(1, this.steer / STEER_FULL));
    this.x = Math.max(-LANE_HALF, Math.min(LANE_HALF, this.x + lock * LATERAL_SPEED * dt));
    this.z += this.speed * dt;
    if (now >= this.nextSpawnMs) {
      this.spawnAlien(now);
      this.nextSpawnMs = now + Math.max(SPAWN_MS_MIN, SPAWN_MS_START - elapsedS * 10);
    }
    this.bolts = this.bolts.filter((b) => {
      b.z += (this.speed + BOLT_REL_SPEED) * dt;
      return b.z - b.born < BOLT_RANGE;
    });
    for (const a of this.aliens) {
      a.z -= a.speed * dt;
      const age = (now - a.bornMs) / 1e3;
      a.x = Math.max(-LANE_HALF, Math.min(
        LANE_HALF,
        a.x0 + Math.sin(a.phase + age * a.swayHz * Math.PI * 2) * a.swayAmp
      ));
      for (const b of this.bolts) {
        if (b.dead) continue;
        if (Math.hypot(b.x - a.x, b.z - a.z) < ALIEN_R + 0.4) {
          b.dead = true;
          a.dead = true;
          this.kills += 1;
          this.onEvent({ type: "kill", alien: a, kills: this.kills, score: this.score });
        }
      }
      if (!a.dead && a.z - this.z < ALIEN_FIRE_RANGE && now >= a.nextFireMs) {
        a.nextFireMs = now + ALIEN_FIRE_MS + this.rng() * 600;
        this.alienBolts.push({ x: a.x, z: a.z - ALIEN_R });
        this.onEvent({ type: "alienFire", x: a.x, z: a.z });
      }
      if (!a.dead && a.z <= this.z && Math.abs(a.x - this.x) < SHIP_R + ALIEN_R) {
        a.dead = true;
        this.loseLife(now, "ram");
        if (this.state !== "running") return;
      }
    }
    this.aliens = this.aliens.filter((a) => !a.dead && a.z > this.z - 12);
    this.bolts = this.bolts.filter((b) => !b.dead);
    this.alienBolts = this.alienBolts.filter((b) => {
      b.z -= ALIEN_BOLT_SPEED * dt;
      const rel = b.z - this.z;
      const crossed = (b.rel === void 0 ? rel > 0 : b.rel > 0) && rel <= 0;
      b.rel = rel;
      if (crossed && Math.abs(b.x - this.x) < SHIP_R) {
        this.loseLife(now, "bolt");
        return false;
      }
      return rel > -12;
    });
    this.timeMs = now - this.startMs;
  }
}
export function fmtMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "\u2014:\u2014";
  const s = ms / 1e3;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
}
