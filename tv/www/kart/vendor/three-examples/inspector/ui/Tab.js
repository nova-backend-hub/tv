import { EventDispatcher } from "three";
export class Tab extends EventDispatcher {
  constructor(title, options = {}) {
    super();
    this.id = title.toLowerCase().replace(/\s+/g, "-");
    this.button = document.createElement("button");
    this.button.className = "tab-btn";
    this.button.textContent = title;
    this.content = document.createElement("div");
    this.content.className = "profiler-content";
    this.content.classList.add(`${this.id}-content`);
    this._isActive = false;
    this.isVisible = true;
    this.isDetached = false;
    this.detachedWindow = null;
    this.allowDetach = options.allowDetach !== void 0 ? options.allowDetach : true;
    this.builtin = options.builtin !== void 0 ? options.builtin : false;
    this.icon = options.icon || null;
    this.builtinButton = null;
    this.miniContent = null;
    this.profiler = null;
    this.onVisibilityChange = null;
  }
  get inspector() {
    return this.profiler.inspector;
  }
  get isActive() {
    if (this.isDetached && this.isVisible) return true;
    const isProfilerVisible = this.profiler && this.profiler.panel.classList.contains("visible");
    if (!isProfilerVisible) return false;
    return this._isActive;
  }
  set isActive(value) {
    this._isActive = value;
  }
  init() {
  }
  update() {
  }
  setActive(isActive) {
    this.button.classList.toggle("active", isActive);
    this.content.classList.toggle("active", isActive);
    this.isActive = isActive;
  }
  show() {
    this.content.style.display = "";
    this.button.style.display = "";
    this.isVisible = true;
    if (this.isDetached && this.detachedWindow) {
      this.detachedWindow.panel.style.display = "";
    }
    if (this.onVisibilityChange) {
      this.onVisibilityChange();
    }
    this.showBuiltin();
  }
  hide() {
    this.content.style.display = "none";
    this.button.style.display = "none";
    this.isVisible = false;
    if (this.isDetached && this.detachedWindow) {
      this.detachedWindow.panel.style.display = "none";
    }
    if (this.onVisibilityChange) {
      this.onVisibilityChange();
    }
    this.hideBuiltin();
  }
  showBuiltin() {
    if (!this.builtin) return;
    if (this.profiler && this.profiler.builtinTabsContainer) {
      this.profiler.builtinTabsContainer.style.display = "";
    }
    if (this.builtinButton) {
      this.builtinButton.style.display = "";
    }
    if (this.miniContent && this.profiler) {
      this.profiler.miniPanel.querySelectorAll(".mini-panel-content").forEach((content) => {
        content.style.display = "none";
      });
      this.profiler.builtinTabsContainer.querySelectorAll(".builtin-tab-btn").forEach((btn) => {
        btn.classList.remove("active");
      });
      if (this.builtinButton) {
        this.builtinButton.classList.add("active");
      }
      if (!this.miniContent.firstChild) {
        while (this.content.firstChild) {
          this.miniContent.appendChild(this.content.firstChild);
        }
      }
      this.miniContent.style.display = "block";
      this.profiler.miniPanel.classList.add("visible");
    }
  }
  hideBuiltin() {
    if (!this.builtin) return;
    if (this.builtinButton) {
      this.builtinButton.style.display = "none";
    }
    if (this.miniContent) {
      this.miniContent.style.display = "none";
      if (this.miniContent.firstChild) {
        while (this.miniContent.firstChild) {
          this.content.appendChild(this.miniContent.firstChild);
        }
      }
    }
    if (this.builtinButton) {
      this.builtinButton.classList.remove("active");
    }
    if (this.profiler) {
      const hasVisibleContent = Array.from(this.profiler.miniPanel.querySelectorAll(".mini-panel-content")).some((content) => content.style.display !== "none");
      if (!hasVisibleContent) {
        this.profiler.miniPanel.classList.remove("visible");
      }
      const hasVisibleBuiltinButtons = Array.from(this.profiler.builtinTabsContainer.querySelectorAll(".builtin-tab-btn")).some((btn) => btn.style.display !== "none");
      if (!hasVisibleBuiltinButtons) {
        this.profiler.builtinTabsContainer.style.display = "none";
      }
    }
  }
}
