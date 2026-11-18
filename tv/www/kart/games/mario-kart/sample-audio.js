import { surfaceAt } from "./track.js";
export class SampledKartAudio {
  constructor(engine) {
    this.engine = engine;
    this.buffers = /* @__PURE__ */ new Map();
    this.loops = /* @__PURE__ */ new Map();
    this.nodes = /* @__PURE__ */ new Set();
    this.projectiles = /* @__PURE__ */ new Map();
    this.log = [];
    this.failures = [];
    this.ready = false;
    this.race = null;
    this.voiceAt = 0;
    this.musicKey = null;
    this.musicEpoch = 0;
    this.musicOrigins = {};
    this.finalAt = 0;
    this.finishAt = 0;
    this.finishUntil = 0;
    this.finishCueUntil = 0;
    this.impactUntil = 0;
    this.lead = 0;
  }
  async prepare() {
    if (this.pending) return this.pending;
    this.pending = (async () => {
      const response = await fetch("/assets/mario-kart/audio/manifest.json");
      if (!response.ok) return false;
      this.manifest = await response.json();
      if (!this.engine.ensureCtx()) return false;
      const entries = Object.entries(this.manifest.cues);
      await Promise.all(Array.from({ length: 6 }, async () => {
        while (entries.length) {
          const [key, cue] = entries.shift();
          try {
            const r = await fetch("/assets/mario-kart/audio/" + cue.file);
            if (!r.ok) throw new Error(String(r.status));
            this.buffers.set(key, await this.engine.ctx.decodeAudioData(await r.arrayBuffer()));
          } catch (error) {
            this.failures.push(key + ": " + error.message);
          }
        }
      }));
      this.ready = ["countdown", "go", "roulette", "decide", "engine", "race", "final"].every((k) => this.buffers.has(k));
      if (this.ready) this.buildGraph();
      return this.ready;
    })().catch((error) => {
      this.failures.push(error.message);
      return false;
    });
    return this.pending;
  }
  buildGraph() {
    const ctx = this.engine.ctx;
    this.mix = ctx.createDynamicsCompressor();
    this.mix.threshold.value = -5;
    this.mix.knee.value = 5;
    this.mix.ratio.value = 5;
    this.mix.attack.value = 3e-3;
    this.mix.release.value = 0.16;
    this.mix.connect(this.engine.master);
    this.buses = {};
    for (const [key, level] of Object.entries({ music: 0.72, stinger: 1, ui: 1, effects: 1, engine: 0.8, voice: 0.9, ambience: 0.6 })) {
      const g = ctx.createGain();
      g.gain.value = level;
      g.connect(this.mix);
      this.buses[key] = g;
    }
    this.capture = this.engine.ctx.createMediaStreamDestination();
    this.engine.master.connect(this.capture);
  }
  note(key, extra = {}) {
    this.log.push({ key, at: this.engine.ctx.currentTime, ...extra });
    if (this.log.length > 240) this.log.shift();
  }
  play(key, { bus = "effects", gain = 1, loop = false, offset = 0, pan = 0, delay = 0, when, record = true } = {}) {
    const buffer = this.buffers.get(key);
    if (!buffer || !this.ready) return null;
    const ctx = this.engine.ctx, cue = this.manifest.cues[key], src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buffer;
    src.loop = loop;
    if (loop) {
      src.loopStart = cue.loopStart || 0;
      src.loopEnd = Math.min(buffer.duration, cue.loopEnd || buffer.duration);
    }
    const base = (cue.gain ?? 0.6) * gain;
    g.gain.value = base;
    src.connect(g);
    let panner = null;
    if (pan) {
      panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(panner).connect(this.buses[bus]);
    } else g.connect(this.buses[bus]);
    const node = { src, g, key, base, panner, bus };
    this.nodes.add(node);
    src.onended = () => {
      this.nodes.delete(node);
      src.disconnect();
      g.disconnect();
      panner == null ? void 0 : panner.disconnect();
    };
    src.start(when ?? ctx.currentTime + delay, Math.min(offset, buffer.duration - 1e-3));
    if (record) this.note(key, { loop, gain, delay });
    return node;
  }
  end(node, fade = 0.035) {
    if (!node || node.ending) return;
    node.ending = true;
    const now = this.engine.ctx.currentTime;
    node.g.gain.cancelScheduledValues(now);
    node.g.gain.setTargetAtTime(0, now, Math.max(3e-3, fade / 4));
    try {
      node.src.stop(now + fade);
    } catch {
    }
  }
  layer(slot, key, level, { rate = 1, offset, loop = true, bus = "engine", when } = {}) {
    var _a;
    let node = this.loops.get(slot);
    if (!key || level <= 1e-3) {
      if (node) {
        this.end(node);
        this.loops.delete(slot);
      }
      return;
    }
    if ((node == null ? void 0 : node.key) !== key) {
      this.end(node);
      node = this.play(key, { bus, gain: 0, loop, when, offset: offset ?? (((_a = this.manifest.cues[key]) == null ? void 0 : _a.loopStart) || 0) });
      if (!node) return;
      this.loops.set(slot, node);
    }
    const now = this.engine.ctx.currentTime;
    node.g.gain.setTargetAtTime((this.manifest.cues[key].gain ?? 0.6) * level, now, 0.055);
    node.src.playbackRate.setTargetAtTime(rate, now, 0.055);
  }
  reset(race) {
    var _a;
    const menu = ((_a = this.race) == null ? void 0 : _a.state) === "ready" && race.state === "ready" && this.musicKey === "menu" ? this.loops.get("music") : null;
    for (const node of this.nodes) if (node !== menu && node.bus !== "ui") this.end(node, 0.015);
    this.loops.clear();
    this.projectiles.clear();
    if (menu) this.loops.set("music", menu);
    else {
      this.musicKey = null;
      this.musicOrigins = {};
    }
    this.resultsPresented = false;
    this.confirmAt = 0;
    this.race = race;
    this.finalAt = 0;
    this.finishAt = 0;
    this.finishUntil = 0;
    this.finishCueUntil = 0;
    this.impactUntil = 0;
    this.voiceAt = 0;
    this.lead = 0;
  }
  get resultsReady() {
    return !this.ready || this.engine.ctx.state !== "running" || this.engine.ctx.currentTime >= this.finishCueUntil;
  }
  presentResults(race, duration) {
    if (this.race !== race) this.reset(race);
    if (!this.ready || !this.resultsReady || this.resultsPresented) return;
    this.resultsPresented = true;
    this.play("resultsIn", { bus: "ui" });
    const tally = this.play("resultsCount", { bus: "ui", loop: true, delay: 0.12 });
    if (tally) tally.src.stop(this.engine.ctx.currentTime + duration);
    this.play("resultsStop", { bus: "ui", delay: duration });
  }
  launch(e, gain = 1, pan = 0) {
    const key = this.buffers.has("use-" + e.item) ? "use-" + e.item : "equip";
    const node = this.play(key, { gain: gain * (key === "equip" ? 0.65 : 1), pan });
    if (node && e.projectile != null) this.projectiles.set(e.projectile, node);
    if (key === "equip") this.note("item-use-placeholder", { item: e.item });
  }
  updateProjectiles(race) {
    for (const [id, node] of this.projectiles) {
      const shell = race.objects.find((o) => o.id === id && o.life > 0);
      const point = shell ? surfaceAt(shell.s, shell.lateral) : null, p = race.player;
      const distance = point ? Math.hypot(point.x - p.x, point.y - p.y, point.z - p.z) : Infinity;
      if (!shell || distance >= 55 || !this.nodes.has(node)) {
        this.end(node, 0.025);
        this.projectiles.delete(id);
        this.note("shell-sound-ended", { projectile: id, reason: !shell ? "removed" : distance >= 55 ? "distance" : "sample-ended" });
      } else node.g.gain.setTargetAtTime(node.base * Math.max(0, Math.min(1, (55 - distance) / 40)), this.engine.ctx.currentTime, 0.025);
    }
  }
  voice(role, racer) {
    const now = this.engine.ctx.currentTime;
    if (now < this.voiceAt) return;
    const id = racer.character.id.replace("_", "-"), keys = [...this.buffers.keys()].filter((k) => k.startsWith(`voice-${id}-${role}-`));
    if (!keys.length) return;
    this.voiceAt = now + 1.5;
    this.play(keys[(this.voiceIndex = (this.voiceIndex || 0) + 1) % keys.length], { bus: "voice" });
  }
  event(e, race) {
    var _a, _b;
    if (!this.ready) return false;
    if (this.race !== race) this.reset(race);
    const r = race.racers[e.racer];
    if (!r) return true;
    if (e.type === "hit") {
      const p = race.player, dx = r.x - p.x, dz = r.z - p.z, distance = Math.hypot(dx, r.y - p.y, dz);
      const owned = e.attacker === 0, local = e.racer === 0;
      if (!owned && !local && distance > 45) return true;
      const key2 = this.buffers.has("hit-" + e.cause) ? "hit-" + e.cause : e.cause === "star" ? "starHit" : "hit";
      const gain = local ? 1 : Math.max(0, 0.75 * (1 - distance / 45));
      if (key2 && gain > 0) this.play(key2, { gain, pan: local ? 0 : (dx * Math.cos(p.heading) + dz * Math.sin(p.heading)) / 24 });
      if (owned && !local && this.buffers.has("shellConfirm") && this.engine.ctx.currentTime >= (this.confirmAt || 0)) {
        this.play("shellConfirm", { gain: 0.9 });
        this.confirmAt = this.engine.ctx.currentTime + 0.12;
      }
      this.impactUntil = this.engine.ctx.currentTime + 0.32;
      this.note("impact-confirmation", { cause: e.cause, attacker: e.attacker, victim: e.racer, gain });
      if (local) this.voice("damage", r);
      return true;
    }
    if (e.racer !== 0) {
      if (!["contact", "turbo", "useItem"].includes(e.type)) return true;
      if (e.type === "contact" && e.other === 0) return true;
      const p = race.player, dx = r.x - p.x, dz = r.z - p.z, distance = Math.hypot(dx, r.y - p.y, dz);
      if (distance > 25) return true;
      if (e.type === "useItem" && e.projectile != null) {
        this.launch(e, 0.24 * Math.max(0, 1 - distance / 25), (dx * Math.cos(p.heading) + dz * Math.sin(p.heading)) / 12);
        return true;
      }
      const key2 = e.type === "turbo" ? "turbo" : e.type === "useItem" ? "equip" : e.type;
      this.play(key2, { gain: (e.type === "contact" ? 0.1 : 0.24) * Math.max(0, 1 - distance / 25), pan: (dx * Math.cos(p.heading) + dz * Math.sin(p.heading)) / 12 });
      return true;
    }
    if (e.type === "box") {
      this.layer("roulette", "roulette", 1, { offset: 0, loop: false, bus: "effects" });
      if (this.buffers.has("box")) this.play("box");
      else {
        this.engine.noise({ dur: 0.11, gain: 0.1, type: "highpass", freq: 4200, sweepTo: 9e3 });
        this.note("box-glass-placeholder");
      }
      return true;
    }
    if (e.type === "itemReady") {
      this.layer("roulette", null, 0);
      this.play("decide");
      return true;
    }
    if (e.type === "drift") {
      this.layer("charge", "drift" + e.tier, 1, { offset: 0, loop: false, bus: "effects" });
      return true;
    }
    if (e.type === "turbo") {
      this.layer("charge", null, 0);
      this.play(e.tier === 3 ? "ultra" : "turbo");
      return true;
    }
    if (e.type === "useItem") {
      if (e.projectile != null) this.launch(e);
      else if (this.buffers.has("use-" + e.item)) this.play("use-" + e.item);
      else if (e.item === "mushroom") this.play("boost");
      else if (e.item === "coin") this.play("coin");
      else if (e.item !== "star") {
        this.play("equip", { gain: 0.65 });
        this.note("item-use-placeholder", { item: e.item });
      }
      this.voice("throw", r);
      return true;
    }
    if (e.type === "finalLap") {
      this.finalAt = this.engine.ctx.currentTime;
      this.play("finalLap", { bus: "music" });
      return true;
    }
    if (e.type === "finish") {
      const now = this.engine.ctx.currentTime, rank = race.standings.findIndex((r2) => r2.id === 0) + 1;
      this.finishAt = now;
      for (const node of this.nodes) this.end(node, 0.06);
      this.loops.clear();
      this.projectiles.clear();
      this.musicKey = null;
      const cue = this.buffers.has("finish") ? "finish" : rank === 1 ? "finishWin" : rank <= 6 ? "finishMid" : "finishLose";
      this.play(cue, { bus: "stinger", gain: 1.15 });
      this.finishCueUntil = now + (((_a = this.buffers.get(cue)) == null ? void 0 : _a.duration) || 0);
      const fanfare = rank === 1 ? "finishWin" : rank <= 6 ? "finishMid" : "finishLose";
      const delay = cue === "finish" ? Math.min(1.1, this.buffers.get(cue).duration) : 0;
      if (cue !== fanfare) this.play(fanfare, { bus: "stinger", delay });
      this.finishUntil = now + delay + (((_b = this.buffers.get(fanfare)) == null ? void 0 : _b.duration) || 3);
      return true;
    }
    if (e.type === "results") return true;
    if (e.type === "hit" && this.buffers.has("hit-" + e.cause)) {
      this.play("hit-" + e.cause);
      this.voice("damage", r);
      return true;
    }
    const key = { rocket: "rocket", burnout: "burnout", hop: "hop", rampJump: "trick", antigrav: "hoverIn", glider: "glider", bump: "bump" }[e.type] || e.type;
    this.play(key, { gain: e.type === "contact" ? 0.32 * Math.min(1, (e.impact || 8) / 12) : 1 });
    if (["rocket", "rampJump", "glider", "hit"].includes(e.type)) this.voice({ rocket: "rocket", rampJump: "jump", glider: "jump", hit: "damage" }[e.type], r);
    return true;
  }
  update(race) {
    if (!this.ready) return;
    if (this.race !== race) this.reset(race);
    this.updateProjectiles(race);
    const r = race.player, ctx = this.engine.ctx, now = ctx.currentTime, active = ["racing", "countdown"].includes(race.state), running = race.state === "racing", speed = Math.abs(r.speed);
    if (this.wasAnti && !r.anti && running) this.play("hoverOut");
    this.wasAnti = r.anti;
    this.layer("motor", active ? race.state === "countdown" ? r.lastInput.gas ? "rev" : "idle" : speed < 3 ? "idle" : "engine" : null, 1, { rate: 0.8 + Math.min(55, speed) / 75 });
    this.layer("boostMotor", running && r.boost > 0 ? "dashEngine" : null, 1, { rate: 0.96 + speed / 200, offset: 0 });
    this.layer("road", running && !r.gliding && !r.jump ? Math.abs(r.lateral) > 11 ? "grass" : "road" : null, Math.min(1, speed / 25), { rate: 0.85 + speed / 70 });
    this.layer("slip", running && r.drift && !r.gliding && !r.jump ? "slip" : null, 0.7 + Math.min(1, speed / 40));
    this.layer("hover", running && r.anti ? "hover" : null, 1);
    this.layer("crowd", active ? "crowd" : null, 1, { bus: "ambience" });
    if (!r.drift || !running) this.layer("charge", null, 0);
    if (!r.roulette || !running) this.layer("roulette", null, 0);
    const isLead = race.standings[0].id === 0;
    this.lead += (Number(isLead) - this.lead) * 0.025;
    let key = race.state === "ready" ? "menu" : race.state === "countdown" ? "grid" : race.state === "racing" ? r.star > 0 ? "star" : race.laps > 1 && r.lap >= race.laps ? "final" : "race" : now >= this.finishUntil ? race.standings.findIndex((r2) => r2.id === 0) < 6 ? "win" : "lose" : null;
    if (this.finalAt && now - this.finalAt < Math.min(2.5, this.buffers.get("finalLap").duration) && key === "final") key = null;
    if (key !== this.musicKey) {
      this.layer("music", null, 0);
      this.layer("musicLead", null, 0);
      this.musicKey = key;
      this.musicEpoch = now;
      if (key) {
        const when = now + 0.02, cue = this.manifest.cues[key];
        let offset = 0;
        if (["race", "final"].includes(key)) {
          this.musicOrigins[key] ??= when;
          offset = Math.max(0, when - this.musicOrigins[key]);
          if (offset >= cue.loopEnd) offset = cue.loopStart + (offset - cue.loopStart) % (cue.loopEnd - cue.loopStart);
        }
        this.layer("music", key, 1, { offset, bus: "music", loop: !["grid", "star"].includes(key), when });
        if (["race", "final"].includes(key)) this.layer("musicLead", key + "Lead", 0.01, { offset, bus: "music", when });
      }
    }
    const base = this.loops.get("music"), lead = this.loops.get("musicLead");
    if (base && lead) {
      const amount = Math.max(0, Math.min(1, (this.lead - 0.3) / 0.4));
      base.g.gain.setTargetAtTime(this.manifest.cues[key].gain * (1 - amount), now, 0.15);
      lead.g.gain.setTargetAtTime(this.manifest.cues[key + "Lead"].gain * amount, now, 0.15);
    }
    const star = running && r.star > 0, impact = now < this.impactUntil, results = race.state === "results";
    this.buses.effects.gain.setTargetAtTime(results ? 0.18 : 1, now, 0.16);
    this.buses.music.gain.setTargetAtTime(results ? 0.32 : star ? 1.05 : impact ? 0.38 : now < this.voiceAt ? 0.54 : 0.72, now, 0.07);
    this.buses.engine.gain.setTargetAtTime(results ? 0.12 : star ? 0.42 : impact ? 0.4 : 0.8, now, 0.08);
    this.buses.ambience.gain.setTargetAtTime(results ? 0.1 : star ? 0.25 : 0.6, now, 0.12);
    this.buses.voice.gain.setTargetAtTime(results ? 0.18 : star ? 0.55 : 0.9, now, 0.08);
  }
  stop() {
    for (const node of this.nodes) this.end(node, 0.01);
    this.loops.clear();
    this.projectiles.clear();
    this.musicKey = null;
  }
  get state() {
    var _a, _b;
    return { context: (_a = this.engine.ctx) == null ? void 0 : _a.state, mix: Object.fromEntries(Object.entries(this.buses || {}).map(([k, v]) => [k, v.gain.value])), ready: this.ready, finishCueUntil: this.finishCueUntil, finishUntil: this.finishUntil, now: (_b = this.engine.ctx) == null ? void 0 : _b.currentTime, loaded: this.buffers.size, failures: this.failures, loops: [...this.loops].map(([slot, n]) => ({ slot, key: n.key, gain: n.g.gain.value, rate: n.src.playbackRate.value })), projectiles: [...this.projectiles.keys()], activeNodes: this.nodes.size, events: this.log.slice(-100), music: this.musicKey };
  }
}
