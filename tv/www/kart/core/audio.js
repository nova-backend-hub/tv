const EXTENSIONS = ["mp3", "wav", "ogg"];
export const AUDIO_MUTED = false;
export class AudioEngine {
  constructor({ basePath = "/audio", volume = 0.7, muted = AUDIO_MUTED } = {}) {
    this.muted = muted;
    this.basePath = basePath;
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.synths = /* @__PURE__ */ new Map();
    this.overrides = /* @__PURE__ */ new Map();
    this.volume = volume;
    this.music = null;
    this.enabled = true;
    registerDefaults(this);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (this.music && this.music.el) {
          if (document.hidden) this.music.el.pause();
          else this.music.el.play().catch(() => {
          });
        }
        if (!this.ctx) return;
        if (document.hidden) this.ctx.suspend();
        else if (this.ctx.state === "suspended") this.ctx.resume();
      });
    }
  }
  /**
   * Browsers refuse to start audio without a gesture. Call from a click/tap;
   * safe to call repeatedly.
   */
  async unlock() {
    if (this.muted) return false;
    if (!this.ensureCtx()) return false;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    return this.ctx.state === "running";
  }
  /** Create the context and graph without resuming — decoding works on a
      suspended context, so samples can load before any user gesture. */
  ensureCtx() {
    if (this.muted) return false;
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.42;
      this.musicGain.connect(this.master);
    }
    return true;
  }
  register(name, synth) {
    this.synths.set(name, synth);
  }
  /** Probe once for a file override; cache the answer either way. */
  async loadOverride(name) {
    if (this.overrides.has(name)) return this.overrides.get(name);
    if (!this.ensureCtx()) return null;
    for (const ext of EXTENSIONS) {
      try {
        const res = await fetch(`${this.basePath}/${name}.${ext}`);
        if (!res.ok) continue;
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.overrides.set(name, buf);
        return buf;
      } catch {
      }
    }
    this.overrides.set(name, null);
    return null;
  }
  play(name, opts = {}) {
    if (this.muted || !this.enabled || !this.ctx) return;
    if (this.ctx.state === "suspended") {
      this.ctx.resume().then(() => {
        if (this.ctx.state === "running") this.play(name, opts);
      }).catch(() => {
      });
      return;
    }
    const override = this.overrides.get(name);
    if (override) return this.playBuffer(override, opts);
    if (!this.overrides.has(name)) this.loadOverride(name).catch(() => {
    });
    const synth = this.synths.get(name);
    if (synth) synth(this, opts);
    return void 0;
  }
  playBuffer(buffer, { gain = 1, loop = false } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = loop;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.master);
    src.start();
    return src;
  }
  // ── Synthesis primitives ─────────────────────────────────────────────────
  /** One enveloped oscillator note. */
  tone({ freq, dur = 0.18, type = "sine", gain = 0.3, attack = 5e-3, detune = 0, delay = 0, dest = null, slideTo = 0 }) {
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    osc.detune.value = detune;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(1e-4, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(1e-4, t0 + dur);
    osc.connect(g).connect(dest || this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    return osc;
  }
  /** Filtered noise burst — impacts, whooshes, explosions. */
  noise({ dur = 0.2, gain = 0.3, type = "lowpass", freq = 1200, q = 1, delay = 0, sweepTo = 0 }) {
    const t0 = this.ctx.currentTime + delay;
    const frames = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t0);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t0 + dur);
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(1e-4, t0 + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
    return src;
  }
  // ── Music ────────────────────────────────────────────────────────────────
  /**
   * The menu theme. If `audio/menu-music.{mp3,wav,ogg}` exists it loops that
   * file THROUGH AN <audio> ELEMENT, not Web Audio — deliberately. A media
   * element follows the media autoplay policy: it may start with no gesture
   * once the user has ever clicked the origin this session, and its audible
   * minutes build the engagement score that eventually lets a completely
   * fresh page load autoplay too. An AudioContext gets neither courtesy —
   * it stays suspended until a fresh gesture on every reload, which is
   * exactly the "silent until I click something" complaint.
   *
   * Safe to call repeatedly: a blocked element is retried on each call.
   * Falls back to the synthesized loop (Web Audio) when no file exists.
   */
  startMusic() {
    if (this.muted) return;
    if (this.music && this.music.el) {
      if (this.music.el.paused) this.music.el.play().catch(() => {
      });
      return;
    }
    if (this.music) return;
    const gen = this.musicGen = (this.musicGen || 0) + 1;
    const tryExt = (i) => {
      if (gen !== this.musicGen) return;
      if (i >= EXTENSIONS.length) {
        this.music = null;
        if (this.ctx) this.startSynthMusic();
        return;
      }
      const el = new Audio(`${this.basePath}/menu-music.${EXTENSIONS[i]}`);
      el.loop = true;
      el.volume = Math.min(1, 0.42 * this.volume);
      const LEAD_SKIP = 0.95;
      el.addEventListener("loadedmetadata", () => {
        try {
          el.currentTime = LEAD_SKIP;
        } catch {
        }
      }, { once: true });
      el.addEventListener("timeupdate", () => {
        if (el.currentTime < LEAD_SKIP - 0.1) {
          try {
            el.currentTime = LEAD_SKIP;
          } catch {
          }
        }
      });
      el.addEventListener("error", () => {
        if (gen !== this.musicGen) return;
        if (this.music && this.music.el === el) this.music = null;
        tryExt(i + 1);
      }, { once: true });
      this.music = { el };
      el.play().catch(() => {
      });
    };
    tryExt(0);
  }
  /**
   * The synthesized fallback theme. Scheduled a bar ahead on a timer rather
   * than one long buffer, so it loops seamlessly and can be stopped
   * mid-phrase.
   */
  startSynthMusic() {
    if (this.muted || !this.ctx || this.music) return;
    const beat = 0.5;
    const chords = [
      [261.63, 329.63, 392, 493.88],
      // Cmaj7
      [220, 261.63, 329.63, 392],
      // Am7
      [293.66, 349.23, 440, 523.25],
      // Dm7
      [196, 246.94, 293.66, 349.23]
      // G7
    ];
    let step = 0;
    let nextTime = this.ctx.currentTime + 0.1;
    const schedule = () => {
      if (!this.music) return;
      while (nextTime < this.ctx.currentTime + 1) {
        const chord = chords[Math.floor(step / 4) % chords.length];
        const note = chord[step % 4];
        const delay = Math.max(0, nextTime - this.ctx.currentTime);
        this.tone({
          freq: note,
          dur: beat * 1.8,
          type: "triangle",
          gain: 0.16,
          attack: 0.04,
          delay,
          dest: this.musicGain
        });
        if (step % 4 === 0) {
          this.tone({
            freq: chord[0] / 2,
            dur: beat * 3,
            type: "sine",
            gain: 0.13,
            attack: 0.06,
            delay,
            dest: this.musicGain
          });
        }
        nextTime += beat;
        step += 1;
      }
    };
    schedule();
    this.music = setInterval(schedule, 250);
  }
  stopMusic() {
    this.musicGen = (this.musicGen || 0) + 1;
    if (this.music && this.music.el) {
      this.music.el.pause();
      this.music.el.src = "";
    } else if (this.music && this.music.src) {
      try {
        this.music.src.stop();
      } catch {
      }
    } else if (typeof this.music === "number") {
      clearInterval(this.music);
    }
    this.music = null;
  }
  setMusicVolume(v) {
    if (this.music && this.music.el) this.music.el.volume = Math.min(1, v * this.volume);
    if (this.musicGain) this.musicGain.gain.value = v;
  }
}
function registerDefaults(a) {
  a.register("hover", () => a.tone({ freq: 880, dur: 0.07, type: "sine", gain: 0.18 }));
  a.register("select", () => {
    a.tone({ freq: 660, dur: 0.09, type: "square", gain: 0.12 });
    a.tone({ freq: 990, dur: 0.14, type: "sine", gain: 0.2, delay: 0.04 });
  });
  a.register("back", () => {
    a.tone({ freq: 520, dur: 0.1, type: "sine", gain: 0.18 });
    a.tone({ freq: 350, dur: 0.14, type: "sine", gain: 0.15, delay: 0.05 });
  });
  a.register("menu-hover", () => {
  });
  a.register("menu-select", () => {
  });
  a.register("menu-back", () => {
  });
  a.register("channel-open", () => {
    a.noise({ dur: 0.5, gain: 0.16, type: "bandpass", freq: 400, sweepTo: 3500, q: 0.8 });
    a.tone({ freq: 330, dur: 0.5, type: "sine", gain: 0.14, slideTo: 990 });
  });
  a.register("channel-launch", () => {
    a.tone({ freq: 523.25, dur: 0.14, type: "sine", gain: 0.2, attack: 8e-3 });
    a.tone({ freq: 783.99, dur: 0.18, type: "sine", gain: 0.2, delay: 0.09, attack: 8e-3 });
    a.tone({ freq: 1046.5, dur: 0.45, type: "sine", gain: 0.22, delay: 0.18, attack: 0.01 });
    a.tone({ freq: 1568, dur: 0.3, type: "sine", gain: 0.08, delay: 0.24 });
    a.noise({ dur: 0.45, gain: 0.05, type: "bandpass", freq: 1500, sweepTo: 5e3, q: 1.2 });
  });
  a.register("boot", () => {
    a.tone({ freq: 523.25, dur: 0.7, type: "sine", gain: 0.22, attack: 0.02 });
    a.tone({ freq: 783.99, dur: 0.9, type: "sine", gain: 0.18, attack: 0.03, delay: 0.18 });
  });
  a.register("pointer-connect", () => {
    a.tone({ freq: 660, dur: 0.1, type: "sine", gain: 0.2 });
    a.tone({ freq: 880, dur: 0.12, type: "sine", gain: 0.2, delay: 0.09 });
    a.tone({ freq: 1320, dur: 0.16, type: "sine", gain: 0.16, delay: 0.18 });
  });
  a.register("swipe", (_, { intensity = 1 } = {}) => {
    a.noise({ dur: 0.13, gain: 0.28, type: "highpass", freq: 1800, sweepTo: 5e3 });
    a.tone({ freq: 400 + Math.min(intensity, 8) * 70, dur: 0.12, type: "triangle", gain: 0.16 });
  });
  a.register("impact", () => {
    a.noise({ dur: 0.18, gain: 0.3, type: "lowpass", freq: 2200, sweepTo: 300 });
    a.tone({ freq: 180, dur: 0.16, type: "triangle", gain: 0.2, slideTo: 90 });
  });
  a.register("explode", () => {
    a.noise({ dur: 0.9, gain: 0.45, type: "lowpass", freq: 1600, sweepTo: 60 });
    a.tone({ freq: 90, dur: 0.7, type: "sawtooth", gain: 0.25, slideTo: 30 });
  });
  a.register("fail", () => a.tone({ freq: 200, dur: 0.16, type: "sine", gain: 0.18, slideTo: 140 }));
}
