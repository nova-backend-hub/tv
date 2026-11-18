import { Pointer } from "./pointer.js";
import { GameLink } from "./net.js";
import { AudioEngine } from "./audio.js";
import { goHome } from "./splash.js";
import { saveSensitivity, loadSensitivity } from "./calibration.js";
import { clamp } from "./orientation.js";
export function createChannel({
  onA = () => {
  },
  onB = null,
  // default: HOME chime + fade back to the menu
  onCommand = () => {
  },
  onSample = null
  // (sample, dt, now) — raw attitude for tilt games
} = {}) {
  const $ = (id) => document.getElementById(id);
  const pointer = new Pointer({});
  pointer.sensitivity = loadSensitivity() ?? 1;
  const audio = new AudioEngine();
  let lastSampleAt = 0;
  let lastSample = null;
  const link = new GameLink({
    onOrientation: (sample) => {
      const now = performance.now();
      const dt = lastSampleAt ? clamp((now - lastSampleAt) / 1e3, 1 / 240, 0.1) : 1 / 60;
      lastSampleAt = now;
      lastSample = sample;
      pointer.update(sample, dt, now);
      if (onSample) onSample(sample, dt, now);
    },
    onCommand: (cmd) => {
      if (cmd.type === "button" && cmd.button === "A") {
        audio.unlock();
        onA();
      } else if (cmd.type === "button" && cmd.button === "B") (onB || (() => goHome(audio)))();
      else if (cmd.type === "calibrate" || cmd.type === "recentre") {
        pointer.recentre();
        onCommand(cmd);
      } else if (cmd.type === "speed") {
        pointer.sensitivity = clamp(pointer.sensitivity * (cmd.factor || 1), 0.2, 6);
        saveSensitivity(pointer.sensitivity);
      } else onCommand(cmd);
    },
    onPresence: ({ controller }) => {
      const on = controller > 0;
      const dot = $("dot");
      const label = $("link-t");
      if (dot) dot.classList.toggle("on", on);
      if (label) label.textContent = on ? "remote connected" : "no remote connected";
    }
  });
  const mouse = { x: 0.5, y: 0.5, active: false };
  window.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX / window.innerWidth;
    mouse.y = e.clientY / window.innerHeight;
    mouse.active = true;
  });
  window.addEventListener("pointerdown", (e) => {
    if (Number.isFinite(e.clientX)) {
      mouse.x = e.clientX / window.innerWidth;
      mouse.y = e.clientY / window.innerHeight;
      mouse.active = true;
    }
    audio.unlock();
    onA();
  });
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      audio.unlock();
      onA();
    } else if (k === "b" || e.key === "Escape") (onB || (() => goHome(audio)))();
    else if (k === "c" || k === "r") pointer.recentre();
    else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const step = e.key === "ArrowRight" ? 1.12 : 1 / 1.12;
      pointer.sensitivity = clamp(pointer.sensitivity * step, 0.2, 6);
      saveSensitivity(pointer.sensitivity);
    } else if (k === "d") {
      const dbg = $("debug");
      if (dbg) dbg.classList.toggle("on");
    }
  });
  function poll(now) {
    if (!pointer.live && mouse.active) pointer.setFromMouse(mouse.x, mouse.y);
    if (pointer.live && now - pointer.lastSeen > 500) pointer.live = false;
    return pointer.sampleAt(now);
  }
  return {
    pointer,
    link,
    audio,
    mouse,
    poll,
    feedback: (m) => link.feedback(m),
    lastSample: () => lastSample
  };
}
