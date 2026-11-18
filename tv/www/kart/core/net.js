export class GameLink {
  constructor({ onOrientation, onCommand, onPresence } = {}) {
    this.socket = io({ transports: ["websocket", "polling"] });
    this.controllers = 0;
    this.slots = [];
    this.rate = 0;
    this.socket.on("connect", () => this.socket.emit("register", "game"));
    let samples = 0;
    let mark = performance.now();
    this.socket.on("orientation", (data) => {
      const now = performance.now();
      samples += 1;
      if (now - mark >= 1e3) {
        this.rate = samples * 1e3 / (now - mark);
        samples = 0;
        mark = now;
      }
      if (onOrientation) onOrientation(data, data.slot ?? 0);
    });
    this.socket.on("command", (cmd) => onCommand && onCommand(cmd, cmd.slot ?? 0));
    this.socket.on("presence", (p) => {
      this.controllers = p.controller;
      this.slots = p.slots || [];
      if (onPresence) onPresence(p);
    });
    this.pingCallbacks = /* @__PURE__ */ new Map();
    this.socket.on("pong-probe", ({ id }) => {
      const started = this.pingCallbacks.get(id);
      if (started === void 0) return;
      this.pingCallbacks.delete(id);
      if (this.onLatency) this.onLatency(performance.now() - started);
    });
  }
  feedback(msg) {
    this.socket.emit("feedback", msg);
  }
  /** Fire a round-trip probe; resolves via onLatency. */
  probeLatency() {
    const id = Math.floor(performance.now() * 1e3) % 1e9;
    this.pingCallbacks.set(id, performance.now());
    this.socket.emit("ping-probe", { id });
    setTimeout(() => this.pingCallbacks.delete(id), 5e3);
  }
}
