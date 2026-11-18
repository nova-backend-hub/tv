import {
  Matrix4,
  Vector3
} from "three";
const _pixelToLocal = new Matrix4();
const _mvp = new Matrix4();
const _viewport = new Matrix4();
const _size = new Vector3();
class InteractionManager {
  constructor() {
    this.objects = [];
    this.element = null;
    this.camera = null;
    this._cachedCssW = -1;
    this._cachedCssH = -1;
  }
  /**
   * Adds one or more objects to the manager.
   *
   * @param {...Object3D} objects - The objects to add.
   * @return {this}
   */
  add(...objects) {
    for (const object of objects) {
      if (this.objects.indexOf(object) === -1) {
        this.objects.push(object);
      }
    }
    return this;
  }
  /**
   * Removes one or more objects from the manager.
   *
   * @param {...Object3D} objects - The objects to remove.
   * @return {this}
   */
  remove(...objects) {
    for (const object of objects) {
      const index = this.objects.indexOf(object);
      if (index !== -1) {
        this.objects.splice(index, 1);
      }
    }
    return this;
  }
  /**
   * Stores the renderer and camera needed for computing element transforms.
   *
   * @param {(WebGPURenderer|WebGLRenderer)} renderer - The renderer.
   * @param {Camera} camera - The camera.
   */
  connect(renderer, camera) {
    this.camera = camera;
    this.element = renderer.domElement;
  }
  /**
   * Updates the element transforms for all registered objects.
   * Call this once per frame in the animation loop.
   */
  update() {
    const canvas = this.element;
    const camera = this.camera;
    if (canvas === null || camera === null) return;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (cssW !== this._cachedCssW || cssH !== this._cachedCssH) {
      _viewport.set(
        cssW / 2,
        0,
        0,
        cssW / 2,
        0,
        -cssH / 2,
        0,
        cssH / 2,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1
      );
      this._cachedCssW = cssW;
      this._cachedCssH = cssH;
    }
    for (const object of this.objects) {
      const texture = object.material.map;
      if (!texture || !texture.isHTMLTexture) continue;
      const element = texture.image;
      if (!element) continue;
      element.style.position = "absolute";
      element.style.left = "0";
      element.style.top = "0";
      element.style.transformOrigin = "0 0";
      const elemW = element.offsetWidth;
      const elemH = element.offsetHeight;
      const geometry = object.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      geometry.boundingBox.getSize(_size);
      _pixelToLocal.set(
        _size.x / elemW,
        0,
        0,
        -_size.x / 2,
        0,
        -_size.y / elemH,
        0,
        _size.y / 2,
        0,
        0,
        1,
        geometry.boundingBox.max.z,
        0,
        0,
        0,
        1
      );
      _mvp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      _mvp.multiply(object.matrixWorld);
      _mvp.multiply(_pixelToLocal);
      _mvp.premultiply(_viewport);
      element.style.transform = "matrix3d(" + _mvp.elements.join(",") + ")";
    }
  }
  /**
   * Disconnects this manager, clearing the renderer and camera references.
   */
  disconnect() {
    this.camera = null;
    this.element = null;
    this._cachedCssW = -1;
    this._cachedCssH = -1;
  }
}
export { InteractionManager };
