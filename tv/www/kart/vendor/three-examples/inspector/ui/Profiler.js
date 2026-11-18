import { EventDispatcher } from "three";
import { Style } from "./Style.js";
import { Graph } from "./Graph.js";
import { getItem, setItem } from "../Inspector.js";
export class Profiler extends EventDispatcher {
  constructor(inspector) {
    super();
    this.inspector = inspector;
    this.tabs = {};
    this.activeTabId = null;
    this.isResizing = false;
    this.lastHeightBottom = 350;
    this.lastWidthRight = 450;
    this.position = "bottom";
    this.detachedWindows = [];
    this.maxZIndex = 1002;
    this.nextTabOriginalIndex = 0;
    this.setupShell();
    this.setupResizing();
    Style.init(this.domElement);
    this.setupWindowResizeListener();
    this.setupOrientationListener();
    this.checkHeaderScroll();
    this.panel.addEventListener("transitionend", (e) => {
      if (e.target === this.panel && (e.propertyName === "width" || e.propertyName === "height" || e.propertyName === "transform")) {
        this.checkHeaderScroll();
      }
    });
  }
  getSize() {
    if (this.panel.classList.contains("visible") === false || this.panel.classList.contains("no-tabs")) {
      return { width: 0, height: 0 };
    }
    if (this.position === "right") {
      return { width: this.panel.offsetWidth, height: 0 };
    } else {
      return { width: 0, height: this.panel.offsetHeight };
    }
  }
  get isMobile() {
    return this.detectMobile();
  }
  get isSmallScreen() {
    return window.innerWidth <= 768;
  }
  detectMobile() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    return isMobileUA || isTouchDevice && this.isSmallScreen;
  }
  setupOrientationListener() {
    const handleOrientationChange = () => {
      if (!this.isMobile) return;
      const isLandscape = window.innerWidth > window.innerHeight;
      const targetPosition = isLandscape ? "right" : "bottom";
      if (this.position !== targetPosition) {
        this.setPosition(targetPosition);
      }
    };
    handleOrientationChange();
    window.addEventListener("orientationchange", handleOrientationChange);
    window.addEventListener("resize", handleOrientationChange);
  }
  setupWindowResizeListener() {
    const constrainDetachedWindows = () => {
      this.detachedWindows.forEach((detachedWindow) => {
        this.constrainWindowToBounds(detachedWindow.panel);
      });
    };
    const constrainMainPanel = () => {
      if (this.panel.classList.contains("maximized")) return;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      if (this.position === "bottom") {
        const currentHeight = this.panel.offsetHeight;
        const maxHeight = windowHeight - 50;
        if (currentHeight > maxHeight) {
          this.panel.style.height = `${maxHeight}px`;
          this.lastHeightBottom = maxHeight;
        }
      } else if (this.position === "right") {
        const currentWidth = this.panel.offsetWidth;
        const maxWidth = windowWidth - 50;
        if (currentWidth > maxWidth) {
          this.panel.style.width = `${maxWidth}px`;
          this.lastWidthRight = maxWidth;
        }
      }
    };
    window.addEventListener("resize", () => {
      if (this.isSmallScreen) {
        this.floatingBtn.style.display = "none";
        this.panel.classList.add("hide-position-toggle");
      } else {
        this.floatingBtn.style.display = "";
        this.panel.classList.remove("hide-position-toggle");
      }
      if (this.isMobile) {
        this.panel.classList.add("is-mobile");
      } else {
        this.panel.classList.remove("is-mobile");
      }
      constrainDetachedWindows();
      constrainMainPanel();
      this.checkHeaderScroll();
    });
  }
  constrainWindowToBounds(windowPanel) {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const panelWidth = windowPanel.offsetWidth;
    const panelHeight = windowPanel.offsetHeight;
    let left = parseFloat(windowPanel.style.left) || windowPanel.offsetLeft || 0;
    let top = parseFloat(windowPanel.style.top) || windowPanel.offsetTop || 0;
    const halfWidth = panelWidth / 2;
    const halfHeight = panelHeight / 2;
    if (left + panelWidth > windowWidth + halfWidth) {
      left = windowWidth + halfWidth - panelWidth;
    }
    if (left < -halfWidth) {
      left = -halfWidth;
    }
    if (top + panelHeight > windowHeight + halfHeight) {
      top = windowHeight + halfHeight - panelHeight;
    }
    if (top < -halfHeight) {
      top = -halfHeight;
    }
    windowPanel.style.left = `${left}px`;
    windowPanel.style.top = `${top}px`;
  }
  setupShell() {
    this.domElement = document.createElement("div");
    this.domElement.classList.add("three-inspector");
    this.toggleButton = document.createElement("button");
    this.toggleButton.classList.add("profiler-toggle");
    this.toggleButton.innerHTML = `
<span class="builtin-tabs-container"></span>
<span class="toggle-text">
	<span class="fps-counter">-</span>
	<span class="fps-label">FPS</span>
</span>
<span class="toggle-icon">
	<svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-device-ipad-horizontal-search"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M11.5 20h-6.5a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v5.5" /><path d="M9 17h2" /><path d="M18 18m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><path d="M20.2 20.2l1.8 1.8" /></svg>
	<span class="console-badge-container">
		<span class="console-badge error" style="display: none;">0</span>
		<span class="console-badge warn" style="display: none;">0</span>
	</span>
</span>
`;
    this.toggleButton.onclick = () => this.togglePanel();
    this.builtinTabsContainer = this.toggleButton.querySelector(".builtin-tabs-container");
    this.miniPanel = document.createElement("div");
    this.miniPanel.classList.add("profiler-mini-panel");
    this.miniPanel.className = "profiler-mini-panel";
    this.panel = document.createElement("div");
    this.panel.classList.add("profiler-panel");
    const header = document.createElement("div");
    header.className = "profiler-header";
    header.addEventListener("wheel", (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        header.scrollLeft += e.deltaY * 0.25;
      }
    }, { passive: false });
    this.tabsContainer = document.createElement("div");
    this.tabsContainer.className = "profiler-tabs";
    const controls = document.createElement("div");
    controls.className = "profiler-controls";
    this.floatingBtn = document.createElement("button");
    this.floatingBtn.classList.add("floating-btn");
    this.floatingBtn.title = "Switch to Right Side";
    this.floatingBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line></svg>';
    this.floatingBtn.onclick = () => this.togglePosition();
    if (this.isSmallScreen) {
      this.floatingBtn.style.display = "none";
      this.panel.classList.add("hide-position-toggle");
    }
    if (this.isMobile) {
      this.panel.classList.add("is-mobile");
    }
    this.maximizeBtn = document.createElement("button");
    this.maximizeBtn.classList.add("maximize-btn");
    this.maximizeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
    this.maximizeBtn.onclick = () => this.toggleMaximize();
    const hideBtn = document.createElement("button");
    hideBtn.classList.add("hide-panel-btn");
    hideBtn.textContent = "-";
    hideBtn.onclick = () => this.togglePanel();
    controls.append(this.floatingBtn, this.maximizeBtn, hideBtn);
    header.append(this.tabsContainer, controls);
    this.contentWrapper = document.createElement("div");
    this.contentWrapper.className = "profiler-content-wrapper";
    const resizer = document.createElement("div");
    resizer.className = "panel-resizer";
    this.panel.append(resizer, header, this.contentWrapper);
    this.domElement.append(this.toggleButton, this.miniPanel, this.panel);
    this.panel.classList.add(`position-${this.position}`);
    if (this.position === "right") {
      this.toggleButton.classList.add("position-right");
      this.miniPanel.classList.add("position-right");
    }
    this.toggleGraph = new Graph(80);
    this.toggleGraph.addLine("fps", "#4c4c6bff");
    this.toggleGraph.domElement.className = "profiler-toggle-graph";
    this.toggleButton.appendChild(this.toggleGraph.domElement);
  }
  setupResizing() {
    const resizer = this.panel.querySelector(".panel-resizer");
    const onStart = (e) => {
      this.isResizing = true;
      this.panel.classList.add("resizing");
      resizer.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startY = e.clientY;
      const startHeight = this.panel.offsetHeight;
      const startWidth = this.panel.offsetWidth;
      const onMove = (moveEvent) => {
        if (!this.isResizing) return;
        moveEvent.preventDefault();
        const currentX = moveEvent.clientX;
        const currentY = moveEvent.clientY;
        if (this.position === "bottom") {
          const newHeight = startHeight - (currentY - startY);
          if (newHeight > 100 && newHeight < window.innerHeight - 50) {
            this.panel.style.height = `${newHeight}px`;
          }
        } else if (this.position === "right") {
          const newWidth = startWidth - (currentX - startX);
          if (newWidth > 200 && newWidth < window.innerWidth - 50) {
            this.panel.style.width = `${newWidth}px`;
          }
        }
        this.dispatchEvent({ type: "resize" });
        this.checkHeaderScroll();
      };
      const onEnd = () => {
        this.isResizing = false;
        this.panel.classList.remove("resizing");
        resizer.removeEventListener("pointermove", onMove);
        resizer.removeEventListener("pointerup", onEnd);
        resizer.removeEventListener("pointercancel", onEnd);
        if (!this.panel.classList.contains("maximized")) {
          if (this.position === "bottom") {
            this.lastHeightBottom = this.panel.offsetHeight;
          } else if (this.position === "right") {
            this.lastWidthRight = this.panel.offsetWidth;
          }
          this.saveLayout();
        }
      };
      resizer.addEventListener("pointermove", onMove);
      resizer.addEventListener("pointerup", onEnd);
      resizer.addEventListener("pointercancel", onEnd);
    };
    resizer.addEventListener("pointerdown", onStart);
  }
  toggleMaximize() {
    if (this.panel.classList.contains("maximized")) {
      this.panel.classList.remove("maximized");
      this.domElement.classList.remove("maximized");
      if (this.position === "bottom") {
        this.panel.style.height = `${this.lastHeightBottom}px`;
        this.panel.style.width = "100%";
      } else if (this.position === "right") {
        this.panel.style.height = "100%";
        this.panel.style.width = `${this.lastWidthRight}px`;
      }
      this.maximizeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
    } else {
      if (this.position === "bottom") {
        this.lastHeightBottom = this.panel.offsetHeight;
      } else if (this.position === "right") {
        this.lastWidthRight = this.panel.offsetWidth;
      }
      this.panel.classList.add("maximized");
      this.domElement.classList.add("maximized");
      if (this.position === "bottom") {
        this.panel.style.height = "100vh";
        this.panel.style.width = "100%";
      } else if (this.position === "right") {
        this.panel.style.height = "100%";
        this.panel.style.width = "100vw";
      }
      this.maximizeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>';
    }
    this.dispatchEvent({ type: "resize" });
  }
  hide() {
    this.miniPanel.classList.remove("visible");
    this.miniPanel.querySelectorAll(".mini-panel-content").forEach((content) => {
      content.style.display = "none";
    });
    this.builtinTabsContainer.querySelectorAll(".builtin-tab-btn").forEach((btn) => {
      btn.classList.remove("active");
    });
  }
  show(tab) {
    this.hide();
    tab.builtinButton.classList.add("active");
    if (!tab.miniContent.firstChild) {
      while (tab.content.firstChild) {
        tab.miniContent.appendChild(tab.content.firstChild);
      }
    }
    tab.miniContent.style.display = "block";
    this.miniPanel.classList.add("visible");
  }
  addTab(tab) {
    this.tabs[tab.id] = tab;
    tab.originalIndex = this.nextTabOriginalIndex++;
    if (tab.allowDetach === false) {
      tab.button.classList.add("no-detach");
    }
    tab.onVisibilityChange = () => this.updatePanelSize();
    this.setupTabDragAndDrop(tab);
    if (!tab.builtin) {
      this.tabsContainer.appendChild(tab.button);
    }
    this.contentWrapper.appendChild(tab.content);
    if (!tab.isVisible) {
      tab.button.style.display = "none";
      tab.content.style.display = "none";
    }
    if (tab.builtin) {
      this.addBuiltinTab(tab);
    }
    this.updatePanelSize();
    tab.profiler = this;
  }
  addBuiltinTab(tab) {
    const builtinButton = document.createElement("button");
    builtinButton.className = "builtin-tab-btn";
    if (tab.icon) {
      builtinButton.innerHTML = tab.icon;
    } else {
      builtinButton.textContent = tab.button.textContent.charAt(0).toUpperCase();
    }
    builtinButton.title = tab.button.textContent;
    const miniContent = document.createElement("div");
    miniContent.className = "mini-panel-content";
    miniContent.style.display = "none";
    tab.builtinButton = builtinButton;
    tab.miniContent = miniContent;
    this.miniPanel.appendChild(miniContent);
    builtinButton.onclick = (e) => {
      e.stopPropagation();
      const isCurrentlyActive = miniContent.style.display !== "none" && miniContent.children.length > 0;
      if (isCurrentlyActive) {
        this.hide();
      } else {
        this.show(tab);
      }
    };
    this.builtinTabsContainer.appendChild(builtinButton);
    tab.builtinButton = builtinButton;
    tab.miniContent = miniContent;
    if (!tab.isVisible) {
      builtinButton.style.display = "none";
      miniContent.style.display = "none";
      const hasVisibleBuiltinButtons = Array.from(this.builtinTabsContainer.querySelectorAll(".builtin-tab-btn")).some((btn) => btn.style.display !== "none");
      if (!hasVisibleBuiltinButtons) {
        this.builtinTabsContainer.style.display = "none";
      }
    }
  }
  removeTab(tab) {
    if (!tab || this.tabs[tab.id] === void 0) return;
    delete this.tabs[tab.id];
    if (tab.isDetached && tab.detachedWindow) {
      if (tab.detachedWindow.panel && tab.detachedWindow.panel.parentNode) {
        tab.detachedWindow.panel.parentNode.removeChild(tab.detachedWindow.panel);
      }
      const index = this.detachedWindows.indexOf(tab.detachedWindow);
      if (index !== -1) {
        this.detachedWindows.splice(index, 1);
      }
    }
    if (!tab.builtin) {
      if (tab.button && tab.button.parentNode) {
        tab.button.parentNode.removeChild(tab.button);
      }
    } else {
      if (tab.builtinButton && tab.builtinButton.parentNode) {
        tab.builtinButton.parentNode.removeChild(tab.builtinButton);
      }
      if (tab.miniContent && tab.miniContent.parentNode) {
        tab.miniContent.parentNode.removeChild(tab.miniContent);
      }
      const hasVisibleBuiltinButtons = Array.from(this.builtinTabsContainer.querySelectorAll(".builtin-tab-btn")).some((btn) => btn.style.display !== "none");
      if (!hasVisibleBuiltinButtons) {
        this.builtinTabsContainer.style.display = "none";
      }
    }
    if (tab.content && tab.content.parentNode) {
      tab.content.parentNode.removeChild(tab.content);
    }
    if (this.activeTabId === tab.id) {
      this.activeTabId = null;
      const remainingTabs = Object.values(this.tabs).filter((t) => !t.isDetached && t.isVisible);
      if (remainingTabs.length > 0) {
        this.setActiveTab(remainingTabs[0].id);
      } else {
        this.updatePanelSize();
      }
    } else {
      this.updatePanelSize();
    }
    tab.onVisibilityChange = null;
    tab.profiler = null;
  }
  updatePanelSize() {
    const hasVisibleTabs = Object.values(this.tabs).some((tab) => !tab.isDetached && tab.isVisible);
    if (!hasVisibleTabs) {
      this.panel.classList.add("no-tabs");
      if (this.panel.classList.contains("maximized")) {
        this.panel.classList.remove("maximized");
        this.domElement.classList.remove("maximized");
        this.maximizeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
      }
      if (this.position === "bottom") {
        this.panel.style.height = "32px";
      } else if (this.position === "right") {
        this.panel.style.width = "45px";
      }
    } else {
      this.panel.classList.remove("no-tabs");
      if (Object.keys(this.tabs).length > 0) {
        if (this.position === "bottom") {
          const currentHeight = parseInt(this.panel.style.height);
          if (currentHeight === 32 || currentHeight === 38) {
            this.panel.style.height = `${this.lastHeightBottom}px`;
          }
        } else if (this.position === "right") {
          const currentWidth = parseInt(this.panel.style.width);
          if (currentWidth === 45) {
            this.panel.style.width = `${this.lastWidthRight}px`;
          }
        }
      }
    }
    this.dispatchEvent({ type: "resize" });
    this.checkHeaderScroll();
  }
  checkHeaderScroll() {
    const header = this.panel.querySelector(".profiler-header");
    if (header) {
      const hasScroll = header.scrollWidth > header.clientWidth + 1;
      if (hasScroll) {
        this.panel.classList.add("has-horizontal-scroll");
      } else {
        this.panel.classList.remove("has-horizontal-scroll");
      }
    }
  }
  setupTabDragAndDrop(tab) {
    tab.button.addEventListener("click", () => {
      if (!isDragging) {
        this.setActiveTab(tab.id);
      }
    });
    if (tab.allowDetach === false) {
      tab.button.style.cursor = "default";
      return;
    }
    let isDragging = false;
    let startX, startY;
    let hasMoved = false;
    let previewWindow = null;
    const dragThreshold = 10;
    const onDragStart = (e) => {
      startX = e.clientX;
      startY = e.clientY;
      isDragging = false;
      hasMoved = false;
      tab.button.setPointerCapture(e.pointerId);
    };
    const onDragMove = (e) => {
      const currentX = e.clientX;
      const currentY = e.clientY;
      const deltaX = Math.abs(currentX - startX);
      const deltaY = Math.abs(currentY - startY);
      if (!isDragging && (deltaX > dragThreshold || deltaY > dragThreshold)) {
        isDragging = true;
        tab.button.style.cursor = "grabbing";
        tab.button.style.opacity = "0.5";
        tab.button.style.transform = "scale(1.05)";
        previewWindow = this.createPreviewWindow(tab, currentX, currentY);
        previewWindow.style.opacity = "0.8";
      }
      if (isDragging && previewWindow) {
        hasMoved = true;
        e.preventDefault();
        previewWindow.style.left = `${currentX - 200}px`;
        previewWindow.style.top = `${currentY - 20}px`;
      }
    };
    const onDragEnd = () => {
      if (isDragging && hasMoved && previewWindow) {
        const finalX = parseInt(previewWindow.style.left) + 200;
        const finalY = parseInt(previewWindow.style.top) + 20;
        if (previewWindow.parentNode) {
          previewWindow.parentNode.removeChild(previewWindow);
        }
        this.detachTab(tab, finalX, finalY);
      } else if (!hasMoved) {
        this.setActiveTab(tab.id);
        if (previewWindow && previewWindow.parentNode) {
          previewWindow.parentNode.removeChild(previewWindow);
        }
      } else if (previewWindow) {
        if (previewWindow.parentNode) {
          previewWindow.parentNode.removeChild(previewWindow);
        }
      }
      tab.button.style.opacity = "";
      tab.button.style.transform = "";
      tab.button.style.cursor = "";
      isDragging = false;
      hasMoved = false;
      previewWindow = null;
      tab.button.removeEventListener("pointermove", onDragMove);
      tab.button.removeEventListener("pointerup", onDragEnd);
      tab.button.removeEventListener("pointercancel", onDragEnd);
    };
    tab.button.addEventListener("pointerdown", (e) => {
      if (this.isMobile && e.pointerType !== "mouse") return;
      onDragStart(e);
      tab.button.addEventListener("pointermove", onDragMove);
      tab.button.addEventListener("pointerup", onDragEnd);
      tab.button.addEventListener("pointercancel", onDragEnd);
    });
    tab.button.style.cursor = "grab";
  }
  createPreviewWindow(tab, x, y) {
    const windowPanel = document.createElement("div");
    windowPanel.className = "detached-tab-panel";
    windowPanel.style.left = `${x - 200}px`;
    windowPanel.style.top = `${y - 20}px`;
    windowPanel.style.pointerEvents = "none";
    this.maxZIndex++;
    windowPanel.style.setProperty("z-index", this.maxZIndex, "important");
    const windowHeader = document.createElement("div");
    windowHeader.className = "detached-tab-header";
    const title = document.createElement("span");
    title.textContent = tab.button.textContent.replace("\u21F1", "").trim();
    windowHeader.appendChild(title);
    const headerControls = document.createElement("div");
    headerControls.className = "detached-header-controls";
    const reattachBtn = document.createElement("button");
    reattachBtn.className = "detached-reattach-btn";
    reattachBtn.innerHTML = "\u21A9";
    headerControls.appendChild(reattachBtn);
    windowHeader.appendChild(headerControls);
    const windowContent = document.createElement("div");
    windowContent.className = "detached-tab-content";
    const resizer = document.createElement("div");
    resizer.className = "detached-tab-resizer";
    windowPanel.appendChild(resizer);
    windowPanel.appendChild(windowHeader);
    windowPanel.appendChild(windowContent);
    this.domElement.appendChild(windowPanel);
    return windowPanel;
  }
  detachTab(tab, x, y) {
    if (tab.isDetached) return;
    if (tab.allowDetach === false) return;
    const allButtons = Array.from(this.tabsContainer.children);
    const tabIdsInOrder = allButtons.map((btn) => {
      return Object.keys(this.tabs).find((id) => this.tabs[id].button === btn);
    }).filter((id) => id !== void 0);
    const currentIndex = tabIdsInOrder.indexOf(tab.id);
    let newActiveTab = null;
    if (this.activeTabId === tab.id) {
      tab.setActive(false);
      const remainingTabs = tabIdsInOrder.filter(
        (id) => id !== tab.id && !this.tabs[id].isDetached && this.tabs[id].isVisible
      );
      if (remainingTabs.length > 0) {
        for (let i = currentIndex - 1; i >= 0; i--) {
          if (remainingTabs.includes(tabIdsInOrder[i])) {
            newActiveTab = tabIdsInOrder[i];
            break;
          }
        }
        if (!newActiveTab) {
          for (let i = currentIndex + 1; i < tabIdsInOrder.length; i++) {
            if (remainingTabs.includes(tabIdsInOrder[i])) {
              newActiveTab = tabIdsInOrder[i];
              break;
            }
          }
        }
        if (!newActiveTab) {
          newActiveTab = remainingTabs[0];
        }
      }
    }
    if (tab.button.parentNode) {
      tab.button.parentNode.removeChild(tab.button);
    }
    if (tab.content.parentNode) {
      tab.content.parentNode.removeChild(tab.content);
    }
    const detachedWindow = this.createDetachedWindow(tab, x, y);
    this.detachedWindows.push(detachedWindow);
    tab.isDetached = true;
    tab.detachedWindow = detachedWindow;
    if (newActiveTab) {
      this.setActiveTab(newActiveTab);
    } else if (this.activeTabId === tab.id) {
      this.activeTabId = null;
    }
    this.updatePanelSize();
    this.saveLayout();
  }
  createDetachedWindow(tab, x, y) {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const estimatedWidth = 400;
    const estimatedHeight = 300;
    let constrainedX = x - 200;
    let constrainedY = y - 20;
    if (constrainedX + estimatedWidth > windowWidth) {
      constrainedX = windowWidth - estimatedWidth;
    }
    if (constrainedX < 0) {
      constrainedX = 0;
    }
    if (constrainedY + estimatedHeight > windowHeight) {
      constrainedY = windowHeight - estimatedHeight;
    }
    if (constrainedY < 0) {
      constrainedY = 0;
    }
    const windowPanel = document.createElement("div");
    windowPanel.className = "detached-tab-panel";
    windowPanel.style.left = `${constrainedX}px`;
    windowPanel.style.top = `${constrainedY}px`;
    if (!tab.isVisible) {
      windowPanel.style.display = "none";
    }
    const windowHeader = document.createElement("div");
    windowHeader.className = "detached-tab-header";
    const title = document.createElement("span");
    title.textContent = tab.button.textContent.replace("\u21F1", "").trim();
    windowHeader.appendChild(title);
    const headerControls = document.createElement("div");
    headerControls.className = "detached-header-controls";
    const reattachBtn = document.createElement("button");
    reattachBtn.className = "detached-reattach-btn";
    reattachBtn.innerHTML = "\u21A9";
    reattachBtn.title = "Reattach to main panel";
    reattachBtn.onclick = () => this.reattachTab(tab);
    headerControls.appendChild(reattachBtn);
    windowHeader.appendChild(headerControls);
    const windowContent = document.createElement("div");
    windowContent.className = "detached-tab-content";
    windowContent.appendChild(tab.content);
    tab.content.style.display = "block";
    tab.content.classList.add("active");
    const resizerTop = document.createElement("div");
    resizerTop.className = "detached-tab-resizer-top";
    const resizerRight = document.createElement("div");
    resizerRight.className = "detached-tab-resizer-right";
    const resizerBottom = document.createElement("div");
    resizerBottom.className = "detached-tab-resizer-bottom";
    const resizerLeft = document.createElement("div");
    resizerLeft.className = "detached-tab-resizer-left";
    const resizerCorner = document.createElement("div");
    resizerCorner.className = "detached-tab-resizer";
    windowPanel.appendChild(resizerTop);
    windowPanel.appendChild(resizerRight);
    windowPanel.appendChild(resizerBottom);
    windowPanel.appendChild(resizerLeft);
    windowPanel.appendChild(resizerCorner);
    windowPanel.appendChild(windowHeader);
    windowPanel.appendChild(windowContent);
    this.domElement.appendChild(windowPanel);
    this.setupDetachedWindowDrag(windowPanel, windowHeader, tab);
    this.setupDetachedWindowResize(windowPanel, resizerTop, resizerRight, resizerBottom, resizerLeft, resizerCorner);
    windowPanel.style.setProperty("z-index", this.maxZIndex, "important");
    return { panel: windowPanel, tab };
  }
  bringWindowToFront(windowPanel) {
    this.maxZIndex++;
    windowPanel.style.setProperty("z-index", this.maxZIndex, "important");
  }
  setupDetachedWindowDrag(windowPanel, header, tab) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;
    windowPanel.addEventListener("pointerdown", () => {
      this.bringWindowToFront(windowPanel);
    });
    const onDragStart = (e) => {
      if (e.target.classList.contains("detached-reattach-btn")) {
        return;
      }
      this.bringWindowToFront(windowPanel);
      isDragging = true;
      header.style.cursor = "grabbing";
      header.setPointerCapture(e.pointerId);
      startX = e.clientX;
      startY = e.clientY;
      const rect = windowPanel.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
    };
    const onDragMove = (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const currentX = e.clientX;
      const currentY = e.clientY;
      const deltaX = currentX - startX;
      const deltaY = currentY - startY;
      let newLeft = startLeft + deltaX;
      let newTop = startTop + deltaY;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const panelWidth = windowPanel.offsetWidth;
      const panelHeight = windowPanel.offsetHeight;
      const halfWidth = panelWidth / 2;
      const halfHeight = panelHeight / 2;
      if (newLeft + panelWidth > windowWidth + halfWidth) {
        newLeft = windowWidth + halfWidth - panelWidth;
      }
      if (newLeft < -halfWidth) {
        newLeft = -halfWidth;
      }
      if (newTop + panelHeight > windowHeight + halfHeight) {
        newTop = windowHeight + halfHeight - panelHeight;
      }
      if (newTop < -halfHeight) {
        newTop = -halfHeight;
      }
      windowPanel.style.left = `${newLeft}px`;
      windowPanel.style.top = `${newTop}px`;
      const panelRect = this.panel.getBoundingClientRect();
      const isOverPanel = currentX >= panelRect.left && currentX <= panelRect.right && currentY >= panelRect.top && currentY <= panelRect.bottom;
      if (isOverPanel) {
        windowPanel.style.opacity = "0.5";
        this.panel.style.outline = "2px solid var(--accent-color)";
      } else {
        windowPanel.style.opacity = "";
        this.panel.style.outline = "";
      }
    };
    const onDragEnd = (e) => {
      if (!isDragging) return;
      isDragging = false;
      header.style.cursor = "";
      windowPanel.style.opacity = "";
      this.panel.style.outline = "";
      const currentX = e.clientX;
      const currentY = e.clientY;
      if (currentX !== void 0 && currentY !== void 0) {
        const panelRect = this.panel.getBoundingClientRect();
        const isOverPanel = currentX >= panelRect.left && currentX <= panelRect.right && currentY >= panelRect.top && currentY <= panelRect.bottom;
        if (isOverPanel && tab) {
          this.reattachTab(tab);
        } else {
          this.saveLayout();
        }
      }
      header.removeEventListener("pointermove", onDragMove);
      header.removeEventListener("pointerup", onDragEnd);
      header.removeEventListener("pointercancel", onDragEnd);
    };
    header.addEventListener("pointerdown", (e) => {
      onDragStart(e);
      header.addEventListener("pointermove", onDragMove);
      header.addEventListener("pointerup", onDragEnd);
      header.addEventListener("pointercancel", onDragEnd);
    });
    header.style.cursor = "grab";
  }
  setupDetachedWindowResize(windowPanel, resizerTop, resizerRight, resizerBottom, resizerLeft, resizerCorner) {
    const minWidth = 250;
    const minHeight = 150;
    const setupResizer = (resizer, direction) => {
      let isResizing = false;
      let startX, startY, startWidth, startHeight, startLeft, startTop;
      const onResizeStart = (e) => {
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        this.bringWindowToFront(windowPanel);
        resizer.setPointerCapture(e.pointerId);
        startX = e.clientX;
        startY = e.clientY;
        startWidth = windowPanel.offsetWidth;
        startHeight = windowPanel.offsetHeight;
        startLeft = windowPanel.offsetLeft;
        startTop = windowPanel.offsetTop;
      };
      const onResizeMove = (e) => {
        if (!isResizing) return;
        e.preventDefault();
        const currentX = e.clientX;
        const currentY = e.clientY;
        const deltaX = currentX - startX;
        const deltaY = currentY - startY;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        if (direction === "right" || direction === "corner") {
          const newWidth = startWidth + deltaX;
          const maxWidth = windowWidth - startLeft;
          if (newWidth >= minWidth && newWidth <= maxWidth) {
            windowPanel.style.width = `${newWidth}px`;
          }
        }
        if (direction === "bottom" || direction === "corner") {
          const newHeight = startHeight + deltaY;
          const maxHeight = windowHeight - startTop;
          if (newHeight >= minHeight && newHeight <= maxHeight) {
            windowPanel.style.height = `${newHeight}px`;
          }
        }
        if (direction === "left") {
          const newWidth = startWidth - deltaX;
          const maxLeft = startLeft + startWidth - minWidth;
          if (newWidth >= minWidth) {
            const newLeft = startLeft + deltaX;
            if (newLeft >= 0 && newLeft <= maxLeft) {
              windowPanel.style.width = `${newWidth}px`;
              windowPanel.style.left = `${newLeft}px`;
            }
          }
        }
        if (direction === "top") {
          const newHeight = startHeight - deltaY;
          const maxTop = startTop + startHeight - minHeight;
          if (newHeight >= minHeight) {
            const newTop = startTop + deltaY;
            if (newTop >= 0 && newTop <= maxTop) {
              windowPanel.style.height = `${newHeight}px`;
              windowPanel.style.top = `${newTop}px`;
            }
          }
        }
        this.dispatchEvent({ type: "resize" });
      };
      const onResizeEnd = () => {
        isResizing = false;
        resizer.removeEventListener("pointermove", onResizeMove);
        resizer.removeEventListener("pointerup", onResizeEnd);
        resizer.removeEventListener("pointercancel", onResizeEnd);
        this.saveLayout();
      };
      resizer.addEventListener("pointerdown", (e) => {
        onResizeStart(e);
        resizer.addEventListener("pointermove", onResizeMove);
        resizer.addEventListener("pointerup", onResizeEnd);
        resizer.addEventListener("pointercancel", onResizeEnd);
      });
    };
    setupResizer(resizerTop, "top");
    setupResizer(resizerRight, "right");
    setupResizer(resizerBottom, "bottom");
    setupResizer(resizerLeft, "left");
    setupResizer(resizerCorner, "corner");
  }
  reattachTab(tab) {
    if (!tab.isDetached) return;
    if (tab.detachedWindow) {
      const index = this.detachedWindows.indexOf(tab.detachedWindow);
      if (index > -1) {
        this.detachedWindows.splice(index, 1);
      }
      if (tab.detachedWindow.panel.parentNode) {
        tab.detachedWindow.panel.parentNode.removeChild(tab.detachedWindow.panel);
      }
      tab.detachedWindow = null;
    }
    tab.isDetached = false;
    const allTabs = Object.values(this.tabs);
    const allTabsSorted = allTabs.filter((t) => t.originalIndex !== void 0 && t.isVisible).sort((a, b) => a.originalIndex - b.originalIndex);
    const currentButtons = Array.from(this.tabsContainer.children);
    let insertIndex = 0;
    for (const t of allTabsSorted) {
      if (t.id === tab.id) {
        break;
      }
      if (!t.isDetached && !t.builtin) {
        insertIndex++;
      }
    }
    if (insertIndex >= currentButtons.length || currentButtons.length === 0) {
      this.tabsContainer.appendChild(tab.button);
    } else {
      this.tabsContainer.insertBefore(tab.button, currentButtons[insertIndex]);
    }
    this.contentWrapper.appendChild(tab.content);
    this.setActiveTab(tab.id);
    this.updatePanelSize();
    this.saveLayout();
  }
  setActiveTab(id) {
    if (this.activeTabId && this.tabs[this.activeTabId] && !this.tabs[this.activeTabId].isDetached) {
      this.tabs[this.activeTabId].setActive(false);
    }
    this.activeTabId = id;
    if (this.tabs[id]) {
      const tab = this.tabs[id];
      if (!tab.isVisible) {
        tab.show();
      }
      tab.setActive(true);
    }
    this.saveLayout();
    this.checkHeaderScroll();
  }
  togglePanel() {
    this.panel.classList.toggle("visible");
    this.toggleButton.classList.toggle("panel-open");
    this.miniPanel.classList.toggle("panel-open");
    const isVisible = this.panel.classList.contains("visible");
    if (isVisible && this.activeTabId && this.tabs[this.activeTabId]) {
      this.tabs[this.activeTabId].setActive(true);
    }
    this.dispatchEvent({ type: "resize" });
    this.saveLayout();
  }
  togglePosition() {
    const newPosition = this.position === "bottom" ? "right" : "bottom";
    this.setPosition(newPosition);
  }
  setPosition(targetPosition) {
    if (this.position === targetPosition) return;
    this.panel.style.transition = "none";
    const isMaximized = this.panel.classList.contains("maximized");
    if (targetPosition === "right") {
      this.position = "right";
      this.floatingBtn.classList.add("active");
      this.floatingBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M3 15h18"></path></svg>';
      this.floatingBtn.title = "Switch to Bottom";
      this.panel.classList.remove("position-bottom");
      this.panel.classList.add("position-right");
      this.toggleButton.classList.add("position-right");
      this.miniPanel.classList.add("position-right");
      this.panel.style.bottom = "";
      this.panel.style.top = "0";
      this.panel.style.right = "0";
      this.panel.style.left = "";
      if (isMaximized) {
        this.panel.style.width = "100vw";
        this.panel.style.height = "100%";
      } else {
        this.panel.style.width = `${this.lastWidthRight}px`;
        this.panel.style.height = "100%";
      }
    } else {
      this.position = "bottom";
      this.floatingBtn.classList.remove("active");
      this.floatingBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line></svg>';
      this.floatingBtn.title = "Switch to Right Side";
      this.panel.classList.remove("position-right");
      this.panel.classList.add("position-bottom");
      this.toggleButton.classList.remove("position-right");
      this.miniPanel.classList.remove("position-right");
      this.panel.style.top = "";
      this.panel.style.right = "";
      this.panel.style.bottom = "0";
      this.panel.style.left = "0";
      if (isMaximized) {
        this.panel.style.width = "100%";
        this.panel.style.height = "100vh";
      } else {
        this.panel.style.width = "100%";
        this.panel.style.height = `${this.lastHeightBottom}px`;
      }
    }
    setTimeout(() => {
      this.panel.style.transition = "";
    }, 50);
    this.updatePanelSize();
    this.saveLayout();
  }
  saveLayout() {
    if (this.isLoadingLayout) return;
    const layout = {
      position: this.position,
      lastHeightBottom: this.lastHeightBottom,
      lastWidthRight: this.lastWidthRight,
      activeTabId: this.activeTabId,
      detachedTabs: [],
      isVisible: this.panel.classList.contains("visible")
    };
    this.detachedWindows.forEach((detachedWindow) => {
      const tab = detachedWindow.tab;
      const panel = detachedWindow.panel;
      const left = parseFloat(panel.style.left) || panel.offsetLeft || 0;
      const top = parseFloat(panel.style.top) || panel.offsetTop || 0;
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      layout.detachedTabs.push({
        tabId: tab.id,
        originalIndex: tab.originalIndex !== void 0 ? tab.originalIndex : 0,
        left,
        top,
        width,
        height
      });
    });
    try {
      setItem("layout", layout);
    } catch (e) {
      console.warn("Failed to save profiler layout:", e);
    }
  }
  loadLayout() {
    this.isLoadingLayout = true;
    try {
      const layout = getItem("layout");
      if (Object.keys(layout).length === 0) return;
      if (layout.detachedTabs && layout.detachedTabs.length > 0) {
        const windowWidth2 = window.innerWidth;
        const windowHeight2 = window.innerHeight;
        layout.detachedTabs = layout.detachedTabs.map((detachedTabData) => {
          let { left, top, width, height } = detachedTabData;
          if (width > windowWidth2) {
            width = windowWidth2 - 100;
          }
          if (height > windowHeight2) {
            height = windowHeight2 - 100;
          }
          const halfWidth = width / 2;
          const halfHeight = height / 2;
          if (left + width > windowWidth2 + halfWidth) {
            left = windowWidth2 + halfWidth - width;
          }
          if (left < -halfWidth) {
            left = -halfWidth;
          }
          if (top + height > windowHeight2 + halfHeight) {
            top = windowHeight2 + halfHeight - height;
          }
          if (top < -halfHeight) {
            top = -halfHeight;
          }
          return {
            ...detachedTabData,
            left,
            top,
            width,
            height
          };
        });
      }
      if (layout.position) {
        this.position = layout.position;
      }
      if (layout.lastHeightBottom) {
        this.lastHeightBottom = layout.lastHeightBottom;
      }
      if (layout.lastWidthRight) {
        this.lastWidthRight = layout.lastWidthRight;
      }
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      if (this.lastHeightBottom > windowHeight - 50) {
        this.lastHeightBottom = windowHeight - 50;
      }
      if (this.lastWidthRight > windowWidth - 50) {
        this.lastWidthRight = windowWidth - 50;
      }
      if (this.position === "right") {
        this.floatingBtn.classList.add("active");
        this.floatingBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M3 15h18"></path></svg>';
        this.floatingBtn.title = "Switch to Bottom";
        this.panel.classList.remove("position-bottom");
        this.panel.classList.add("position-right");
        this.toggleButton.classList.add("position-right");
        this.miniPanel.classList.add("position-right");
        this.panel.style.bottom = "";
        this.panel.style.top = "0";
        this.panel.style.right = "0";
        this.panel.style.left = "";
        this.panel.style.width = `${this.lastWidthRight}px`;
        this.panel.style.height = "100%";
      } else {
        this.panel.style.height = `${this.lastHeightBottom}px`;
      }
      if (layout.isVisible) {
        this.panel.classList.add("visible");
        this.toggleButton.classList.add("panel-open");
      }
      if (layout.activeTabId) {
        this.setActiveTab(layout.activeTabId);
      }
      if (layout.detachedTabs && layout.detachedTabs.length > 0) {
        this.pendingDetachedTabs = layout.detachedTabs;
        this.restoreDetachedTabs();
      }
      this.updatePanelSize();
      if (this.panel.classList.contains("visible")) {
        this.miniPanel.classList.add("panel-open");
      }
    } catch (e) {
      console.warn("Failed to load profiler layout:", e);
    } finally {
      this.isLoadingLayout = false;
    }
  }
  restoreDetachedTabs() {
    if (!this.pendingDetachedTabs || this.pendingDetachedTabs.length === 0) return;
    this.pendingDetachedTabs.forEach((detachedTabData) => {
      const tab = this.tabs[detachedTabData.tabId];
      if (!tab || tab.isDetached) return;
      if (detachedTabData.originalIndex !== void 0) {
        tab.originalIndex = detachedTabData.originalIndex;
      }
      if (tab.button.parentNode) {
        tab.button.parentNode.removeChild(tab.button);
      }
      if (tab.content.parentNode) {
        tab.content.parentNode.removeChild(tab.content);
      }
      const detachedWindow = this.createDetachedWindow(tab, 0, 0);
      detachedWindow.panel.style.left = `${detachedTabData.left}px`;
      detachedWindow.panel.style.top = `${detachedTabData.top}px`;
      detachedWindow.panel.style.width = `${detachedTabData.width}px`;
      detachedWindow.panel.style.height = `${detachedTabData.height}px`;
      this.constrainWindowToBounds(detachedWindow.panel);
      this.detachedWindows.push(detachedWindow);
      tab.isDetached = true;
      tab.detachedWindow = detachedWindow;
    });
    this.pendingDetachedTabs = null;
    this.detachedWindows.forEach((detachedWindow) => {
      const currentZIndex = parseInt(getComputedStyle(detachedWindow.panel).zIndex) || 0;
      if (currentZIndex > this.maxZIndex) {
        this.maxZIndex = currentZIndex;
      }
    });
    const needsNewActiveTab = !this.activeTabId || !this.tabs[this.activeTabId] || this.tabs[this.activeTabId].isDetached || !this.tabs[this.activeTabId].isVisible;
    if (needsNewActiveTab) {
      const tabIds = Object.keys(this.tabs);
      const availableTabs = tabIds.filter(
        (id) => !this.tabs[id].isDetached && this.tabs[id].isVisible
      );
      if (availableTabs.length > 0) {
        const buttons = Array.from(this.tabsContainer.children);
        const orderedTabIds = buttons.map((btn) => {
          return Object.keys(this.tabs).find((id) => this.tabs[id].button === btn);
        }).filter(
          (id) => id !== void 0 && !this.tabs[id].isDetached && this.tabs[id].isVisible
        );
        this.setActiveTab(orderedTabIds[0] || availableTabs[0]);
      } else {
        this.activeTabId = null;
      }
    }
    this.updatePanelSize();
  }
}
