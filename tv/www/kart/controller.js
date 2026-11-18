"use strict";
var _a, _b;
const socket = io({ transports: ["websocket", "polling"] });
const $ = (id) => document.getElementById(id);
const els = {
  net: $("net"),
  dotNet: $("dot-net"),
  hz: $("hz"),
  player: $("player"),
  gate: $("gate"),
  enable: $("enable"),
  remote: $("remote"),
  stage: $("stage"),
  btnA: $("btn-a"),
  btnB: $("btn-b"),
  btnHome: $("btn-home"),
  btnMinus: $("btn-minus"),
  btnPlus: $("btn-plus"),
  btn1: $("btn-1"),
  btn2: $("btn-2"),
  power: $("power"),
  speaker: $("speaker"),
  leds: $("leds"),
  sheet: $("sheet"),
  rates: $("rates"),
  diag: $("diag"),
  diagBody: $("diag-body"),
  diagTitle: $("diag-title"),
  diagDump: $("diag-dump")
};
let enabledAt = 0;
let gameConnected = false;
let wheelMode = false;
let wheelModeUntil = 0;
const heldButtons = {};
const heldPointers = /* @__PURE__ */ new Map();
const buzz = (pattern) => {
  if (navigator.vibrate) navigator.vibrate(pattern);
};
let actx = null;
function phoneAudioUnlock() {
  if (actx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  try {
    actx = new Ctx();
  } catch {
  }
}
function pSound(kind) {
  if (!actx || actx.state !== "running") {
    if (actx) actx.resume();
    return;
  }
  const t0 = actx.currentTime;
  const g = actx.createGain();
  g.connect(actx.destination);
  if (kind === "click") {
    const o = actx.createOscillator();
    o.type = "square";
    o.frequency.value = 660;
    g.gain.setValueAtTime(0.05, t0);
    g.gain.exponentialRampToValueAtTime(1e-4, t0 + 0.05);
    o.connect(g);
    o.start(t0);
    o.stop(t0 + 0.06);
  } else if (kind === "swoosh") {
    const frames = Math.floor(actx.sampleRate * 0.12);
    const buf = actx.createBuffer(1, frames, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < frames; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = actx.createBufferSource();
    src.buffer = buf;
    const f = actx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(2400, t0);
    f.frequency.exponentialRampToValueAtTime(500, t0 + 0.12);
    g.gain.value = 0.12;
    src.connect(f).connect(g);
    src.start(t0);
  } else if (kind === "thud") {
    const o = actx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(160, t0);
    o.frequency.exponentialRampToValueAtTime(50, t0 + 0.25);
    g.gain.setValueAtTime(0.18, t0);
    g.gain.exponentialRampToValueAtTime(1e-4, t0 + 0.28);
    o.connect(g);
    o.start(t0);
    o.stop(t0 + 0.3);
  }
}
let talkTimer = 0;
function speakerTalk(ms = 220) {
  els.speaker.classList.add("talk");
  clearTimeout(talkTimer);
  talkTimer = setTimeout(() => els.speaker.classList.remove("talk"), ms);
}
function setNet(text, state) {
  els.net.textContent = text;
  els.dotNet.className = `dot ${state || ""}`;
  els.power.classList.toggle("err", state === "err");
  els.power.classList.toggle("linked", state !== "err" && gameConnected);
}
function syncLeds() {
  const linked = gameConnected && playerSlot !== null;
  els.leds.classList.toggle("seek", !linked);
  const lights = els.leds.children;
  for (let i = 0; i < lights.length; i += 1) {
    lights[i].classList.toggle("on", linked && i === playerSlot);
  }
}
socket.on("connect", () => {
  socket.emit("register", "controller");
  setNet("waiting for PC\u2026", "");
  syncLeds();
});
socket.on("disconnect", () => {
  setNet("disconnected", "err");
  gameConnected = false;
  syncLeds();
});
socket.on("connect_error", () => setNet("server unreachable", "err"));
socket.on("presence", ({ game }) => {
  gameConnected = game > 0;
  setNet(gameConnected ? "linked to PC" : "waiting for PC\u2026", gameConnected ? "on" : "");
  if (gameConnected) buzz(15);
  syncLeds();
});
socket.on("ping-probe", ({ id }) => socket.emit("pong-probe", { id }));
let playerSlot = null;
socket.on("slot", ({ slot }) => {
  playerSlot = slot;
  els.player.textContent = `P${slot + 1}`;
  els.player.classList.remove("hide");
  syncLeds();
});
socket.on("slot-denied", ({ max }) => {
  setNet(`all ${max} player slots are full`, "err");
});
socket.on("feedback", (msg) => {
  if (msg.type === "slice") {
    buzz(msg.combo > 2 ? [12, 18, 22] : 18);
    speakerTalk();
    pSound("swoosh");
  } else if (msg.type === "bomb") {
    buzz([60, 40, 120]);
    speakerTalk(500);
    pSound("thud");
  } else if (msg.type === "miss") {
    buzz(8);
  } else if (msg.type === "launch") {
    speakerTalk(120);
  }
});
let latest = null;
let motion = null;
let streaming = false;
let rawEvents = 0;
let sensorEvents = 0;
let usingGenericSensor = false;
let orientationSource = null;
function onOrientation(e) {
  rawEvents += 1;
  if (e.alpha === null && e.beta === null && e.gamma === null) return;
  if (e.type === "deviceorientationabsolute") orientationSource = e.type;
  else if (orientationSource === null) orientationSource = e.type;
  if (e.type !== orientationSource) return;
  sensorEvents += 1;
  latest = {
    alpha: e.alpha || 0,
    beta: e.beta || 0,
    gamma: e.gamma || 0,
    // iOS exposes a true-north heading; useful as a drift-free yaw source.
    heading: typeof e.webkitCompassHeading === "number" ? e.webkitCompassHeading : null
  };
  flush();
}
const MIN_EMIT_MS = 6;
let lastEmit = 0;
function flush() {
  if (!streaming || !latest) return;
  const now = performance.now();
  if (now - lastEmit < MIN_EMIT_MS) return;
  lastEmit = now;
  socket.emit("orientation", { ...latest, motion, t: now, ...wheelMode ? { buttons: { ...heldButtons } } : {} });
  sent += 1;
}
function onMotion(e) {
  const a = e.acceleration || e.accelerationIncludingGravity;
  const r = e.rotationRate;
  if (!a && !r) return;
  motion = {
    ax: a ? a.x || 0 : 0,
    ay: a ? a.y || 0 : 0,
    az: a ? a.z || 0 : 0,
    // The raw gyroscope. Unlike `deviceorientation` — which is the OS's fused
    // attitude estimate and carries that fusion's latency — this is a direct
    // readout of angular velocity, and it is what makes the cursor feel
    // immediate. The PC integrates it and corrects against orientation.
    rz: r ? r.alpha || 0 : 0,
    rx: r ? r.beta || 0 : 0,
    ry: r ? r.gamma || 0 : 0
  };
  flush();
}
function capabilities() {
  const hasDOE = typeof DeviceOrientationEvent !== "undefined";
  return {
    origin: location.origin,
    secureContext: window.isSecureContext === true,
    deviceOrientationEvent: hasDOE,
    requestPermission: hasDOE && typeof DeviceOrientationEvent.requestPermission === "function",
    absoluteOrientationSensor: typeof window.AbsoluteOrientationSensor === "function",
    relativeOrientationSensor: typeof window.RelativeOrientationSensor === "function"
  };
}
async function sensorPermissionStates() {
  if (!navigator.permissions) return { permissions: "unsupported" };
  const out = {};
  for (const name of ["accelerometer", "gyroscope", "magnetometer"]) {
    try {
      out[name] = (await navigator.permissions.query({ name })).state;
    } catch {
      out[name] = "unqueryable";
    }
  }
  return out;
}
async function renderDiagnostics(headline, detail) {
  const caps = capabilities();
  const perms = await sensorPermissionStates();
  els.diag.classList.remove("hide");
  els.sheet.classList.add("open");
  els.diagTitle.textContent = headline;
  els.diagBody.textContent = detail;
  els.diagDump.textContent = JSON.stringify({ ...caps, ...perms, ua: navigator.userAgent }, null, 1);
}
let genericSensor = null;
const SENSOR_ERRORS = {
  SecurityError: "Blocked by the browser. This page must be served over HTTPS \u2014 an insecure origin cannot read motion sensors.",
  NotAllowedError: "Motion sensors are blocked for this site. Chrome \u2192 \u22EE \u2192 Settings \u2192 Site settings \u2192 Motion sensors \u2192 allow.",
  NotReadableError: "This device reports no orientation sensor available."
};
function startGenericSensor() {
  const Ctor = window.AbsoluteOrientationSensor || window.RelativeOrientationSensor;
  if (!Ctor) return false;
  try {
    genericSensor = new Ctor({ frequency: 120, referenceFrame: "device" });
  } catch (err) {
    renderDiagnostics("\u26A0\uFE0F Sensor unavailable", SENSOR_ERRORS[err.name] || err.message);
    return false;
  }
  genericSensor.addEventListener("reading", () => {
    const q = genericSensor.quaternion;
    if (!q) return;
    rawEvents += 1;
    sensorEvents += 1;
    usingGenericSensor = true;
    latest = { quat: [q[0], q[1], q[2], q[3]] };
    els.diag.classList.add("hide");
  });
  genericSensor.addEventListener("error", (ev) => {
    const name = ev.error && ev.error.name;
    renderDiagnostics("\u26A0\uFE0F Sensor error", SENSOR_ERRORS[name] || `${name}: ${ev.error && ev.error.message}`);
  });
  try {
    genericSensor.start();
    return true;
  } catch (err) {
    renderDiagnostics("\u26A0\uFE0F Sensor unavailable", SENSOR_ERRORS[err.name] || err.message);
    return false;
  }
}
async function requestSensors() {
  const caps = capabilities();
  if (!caps.secureContext) {
    await renderDiagnostics(
      "\u26A0\uFE0F Not a secure page",
      `This page is served from ${location.origin}, which browsers treat as insecure \u2014 motion sensors are blocked outright. Restart the server with "npm start" (HTTPS) and open the https:// address instead.`
    );
    throw new Error("needs HTTPS for sensors");
  }
  if (!caps.deviceOrientationEvent && !caps.absoluteOrientationSensor && !caps.relativeOrientationSensor) {
    await renderDiagnostics("\u26A0\uFE0F No orientation API", "This browser exposes no orientation sensor API at all.");
    throw new Error("no orientation API");
  }
  if (caps.requestPermission) {
    const state = await DeviceOrientationEvent.requestPermission();
    if (state !== "granted") throw new Error("Motion permission denied");
  }
  if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
    try {
      await DeviceMotionEvent.requestPermission();
    } catch {
    }
  }
  window.addEventListener("deviceorientation", onOrientation, true);
  window.addEventListener("deviceorientationabsolute", onOrientation, true);
  window.addEventListener("devicemotion", onMotion, true);
  setTimeout(() => {
    if (rawEvents > 0) return;
    if (!startGenericSensor()) {
      renderDiagnostics(
        "\u26A0\uFE0F No sensor data",
        "No orientation events fired and no fallback sensor is available. Check Chrome \u2192 Settings \u2192 Site settings \u2192 Motion sensors."
      );
    }
  }, 1500);
}
async function lockUpright() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    }
    if (screen.orientation && screen.orientation.lock) {
      if (!wheelMode) await screen.orientation.lock("portrait");
    }
  } catch {
  }
}
els.enable.addEventListener("click", async () => {
  els.enable.disabled = true;
  phoneAudioUnlock();
  try {
    await requestSensors();
    streaming = true;
    enabledAt = performance.now();
    els.gate.classList.add("hide");
    els.remote.classList.remove("asleep");
    buzz([10, 40, 18]);
    speakerTalk(400);
    keepAwake();
    lockUpright();
    socket.emit("command", { type: "calibrate" });
  } catch (err) {
    els.enable.disabled = false;
    setNet(err.message, "err");
  }
});
function onPress(el, fn, pattern = 10) {
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (wheelMode && el !== els.power) return;
    buzz(pattern);
    fn();
  });
}
onPress(els.btnA, () => {
  socket.emit("command", { type: "button", button: "A" });
  pSound("click");
}, 12);
onPress(els.btnB, () => socket.emit("command", { type: "button", button: "B" }), 10);
onPress(els.btnHome, () => socket.emit("command", { type: "button", button: "B" }), 10);
onPress(els.btnMinus, () => socket.emit("command", { type: "speed", factor: 1 / 1.12 }), 6);
onPress(els.btnPlus, () => socket.emit("command", { type: "speed", factor: 1.12 }), 6);
onPress(els.btn1, () => socket.emit("command", { type: "recentre" }), 8);
onPress(els.btn2, () => els.sheet.classList.toggle("open"), 8);
onPress(els.power, () => speakerTalk(250), [5, 30, 10]);
for (const dp of document.querySelectorAll(".dp")) {
  if (dp.tagName === "BUTTON") onPress(dp, () => {
  }, 6);
}
function clearWheelButtons() {
  for (const k of Object.keys(heldButtons)) delete heldButtons[k];
  heldPointers.clear();
  if (socket.connected) socket.emit("command", { type: "buttons", buttons: {} });
}
function layoutWheelRemote() {
  var _a2, _b2, _c;
  if (!wheelMode) return;
  const w = ((_a2 = window.visualViewport) == null ? void 0 : _a2.width) || innerWidth, h = ((_b2 = window.visualViewport) == null ? void 0 : _b2.height) || innerHeight;
  const landscape = w > h;
  const shortSide = Math.min(w, h), longSide = Math.max(w, h);
  document.body.classList.toggle("wheel-tablet", shortSide >= 600);
  document.body.style.setProperty("--remote-scale", String(Math.min((longSide - 64) / 780, (shortSide - 64) / 360)));
  const reported = Number.isFinite(window.orientation) ? window.orientation : (_c = screen.orientation) == null ? void 0 : _c.angle;
  const angle = landscape ? reported === 270 || reported === -90 ? -90 : 90 : reported === 180 ? 180 : 0;
  const root = document.body.style;
  root.setProperty("--remote-width", `${landscape ? h : w}px`);
  root.setProperty("--remote-height", `${landscape ? w : h}px`);
  root.setProperty("--remote-vh", `${(landscape ? w : h) / 100}px`);
  root.setProperty("--remote-angle", `${-angle}deg`);
}
window.addEventListener("resize", layoutWheelRemote);
(_a = window.visualViewport) == null ? void 0 : _a.addEventListener("resize", layoutWheelRemote);
window.addEventListener("orientationchange", () => {
  if (wheelMode) clearWheelButtons();
  layoutWheelRemote();
});
(_b = screen.orientation) == null ? void 0 : _b.addEventListener("change", () => {
  if (wheelMode) clearWheelButtons();
  layoutWheelRemote();
});
function setWheelMode(on) {
  var _a2, _b2, _c, _d;
  if (wheelMode === on) return;
  clearWheelButtons();
  wheelMode = on;
  document.body.classList.toggle("wheel-mode", on);
  document.documentElement.classList.toggle("wheel-mode", on);
  els.sheet.classList.remove("open");
  if (on) {
    (_b2 = (_a2 = screen.orientation) == null ? void 0 : _a2.unlock) == null ? void 0 : _b2.call(_a2);
    layoutWheelRemote();
  } else {
    document.body.classList.remove("wheel-tablet");
    for (const key of ["width", "height", "vh", "angle", "scale"]) document.body.style.removeProperty("--remote-" + key);
    (_d = (_c = screen.orientation) == null ? void 0 : _c.lock) == null ? void 0 : _d.call(_c, "portrait").catch(() => {
    });
  }
}
socket.on("feedback", (msg) => {
  if (msg.type === "controller-profile" && msg.profile === "wheel") {
    wheelModeUntil = performance.now() + 2500;
    setWheelMode(true);
  }
  if (msg.type === "controller-profile" && msg.profile === "default") setWheelMode(false);
});
const wheelBindings = [
  [els.btnA, "A"],
  [els.btnB, "B"],
  [els.btn1, "1"],
  [els.btn2, "2"],
  [document.querySelector(".dp.u"), "up"],
  [document.querySelector(".dp.d"), "down"],
  [document.querySelector(".dp.l"), "left"],
  [document.querySelector(".dp.r"), "right"]
];
for (const [el, button] of wheelBindings) {
  el.addEventListener("pointerdown", (e) => {
    if (!wheelMode) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    heldPointers.set(e.pointerId, button);
    heldButtons[button] = true;
    let menuDirection;
    if (["up", "down", "left", "right"].includes(button)) {
      const b = el.getBoundingClientRect(), d = document.getElementById("dpad").getBoundingClientRect();
      const x = b.x + b.width / 2 - d.x - d.width / 2, y = b.y + b.height / 2 - d.y - d.height / 2;
      menuDirection = Math.abs(x) > Math.abs(y) ? x < 0 ? "left" : "right" : y < 0 ? "up" : "down";
    }
    socket.emit("command", { type: "button", button, menuDirection, pressed: true });
    buzz(8);
  });
  const release = (e) => {
    const key = heldPointers.get(e.pointerId);
    if (!key) return;
    heldPointers.delete(e.pointerId);
    heldButtons[key] = [...heldPointers.values()].includes(key);
    if (!heldButtons[key]) socket.emit("command", { type: "button-up", button: key });
  };
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(event, release);
}
els.btnHome.addEventListener("pointerdown", (e) => {
  if (!wheelMode) return;
  e.preventDefault();
  clearWheelButtons();
  socket.emit("command", { type: "home" });
  setWheelMode(false);
});
els.btnMinus.addEventListener("pointerdown", (e) => {
  if (!wheelMode) return;
  e.preventDefault();
  socket.emit("command", { type: "recentre" });
});
window.addEventListener("blur", clearWheelButtons);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearWheelButtons();
});
socket.on("disconnect", () => {
  clearWheelButtons();
  setWheelMode(false);
});
setInterval(() => {
  if (wheelMode && performance.now() > wheelModeUntil) setWheelMode(false);
  if (wheelMode && socket.connected) socket.emit("command", { type: "buttons", buttons: { ...heldButtons } });
}, 150);
document.addEventListener("pointerdown", (e) => {
  if (els.sheet.classList.contains("open") && !els.sheet.contains(e.target) && e.target !== els.btn2) {
    els.sheet.classList.remove("open");
  }
});
async function keepAwake() {
  try {
    if ("wakeLock" in navigator) {
      let lock = await navigator.wakeLock.request("screen");
      document.addEventListener("visibilitychange", async () => {
        if (document.visibilityState === "visible") {
          try {
            lock = await navigator.wakeLock.request("screen");
          } catch {
          }
        }
      });
    }
  } catch {
  }
}
let sent = 0;
let hzMark = performance.now();
let lastSensorCount = 0;
function updateDiagnostics(now, elapsed) {
  const sensorHz = Math.round((sensorEvents - lastSensorCount) * 1e3 / elapsed);
  const sentHz = Math.round(sent * 1e3 / elapsed);
  lastSensorCount = sensorEvents;
  const source = usingGenericSensor ? "OrientationSensor" : "deviceorientation";
  els.hz.textContent = `${sentHz} Hz`;
  els.rates.textContent = `sensor ${sensorHz} Hz \xB7 sent ${sentHz} Hz \xB7 ${transportName()} \xB7 ${source}`;
  if (!streaming) return;
  if (sensorEvents === 0 && now - enabledAt > 3500) {
    if (!els.diag.classList.contains("hide")) return;
    renderDiagnostics(
      "\u26A0\uFE0F No sensor data",
      rawEvents > 0 ? "Orientation events are firing but arriving empty. Move the phone in a figure-8 to settle its compass." : "No orientation events are firing. On iOS: Settings \u2192 Apps \u2192 Safari \u2192 Motion & Orientation Access. On Chrome: \u22EE \u2192 Settings \u2192 Site settings \u2192 Motion sensors."
    );
  } else if (sensorEvents > 0) {
    els.diag.classList.add("hide");
  }
}
function transportName() {
  try {
    return socket.io.engine.transport.name;
  } catch {
    return "offline";
  }
}
function displayAngles(sample) {
  if (!sample.quat) {
    return { yaw: sample.alpha, pitch: sample.beta, roll: sample.gamma };
  }
  const [x, y, z, w] = sample.quat;
  const c2 = { x: 2 * (x * y - z * w), y: 1 - 2 * (x * x + z * z), z: 2 * (y * z + x * w) };
  return {
    yaw: Math.atan2(c2.x, c2.y) * 180 / Math.PI,
    pitch: Math.asin(Math.max(-1, Math.min(1, c2.z))) * 180 / Math.PI,
    roll: 0
  };
}
const lean = { x: 0, y: 0 };
const clampN = (v, m) => Math.max(-m, Math.min(m, v));
function tick(now) {
  requestAnimationFrame(tick);
  if (streaming && latest) {
    const a = displayAngles(latest);
    const tx = clampN((a.pitch - 40) * 0.14, 7);
    const ty = clampN((a.roll || 0) * 0.18, 9);
    lean.x += (tx - lean.x) * 0.12;
    lean.y += (ty - lean.y) * 0.12;
    els.remote.style.transform = `rotateX(${(-lean.x).toFixed(2)}deg) rotateY(${lean.y.toFixed(2)}deg)`;
  }
  if (now - hzMark >= 1e3) {
    updateDiagnostics(now, now - hzMark);
    sent = 0;
    hzMark = now;
  }
}
requestAnimationFrame(tick);
document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
if (!window.isSecureContext) {
  els.enable.textContent = "\u26A0\uFE0F Sensors need HTTPS";
  els.enable.disabled = true;
  renderDiagnostics(
    "\u26A0\uFE0F Not a secure page",
    `Served from ${location.origin}. Browsers block motion sensors on insecure origins \u2014 and they do it silently. Restart with "npm start" (HTTPS) and open the https:// address.`
  );
}
