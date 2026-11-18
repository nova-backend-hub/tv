import { StereoCamera, Vector2, PassNode, RendererUtils } from "three/webgpu";
const _size = /* @__PURE__ */ new Vector2();
let _rendererState;
class StereoPassNode extends PassNode {
  static get type() {
    return "StereoPassNode";
  }
  /**
   * Constructs a new stereo pass node.
   *
   * @param {Scene} scene - The scene to render.
   * @param {Camera} camera - The camera to render the scene with.
   */
  constructor(scene, camera) {
    super(PassNode.COLOR, scene, camera);
    this.isStereoPassNode = true;
    this.stereo = new StereoCamera();
    this.stereo.aspect = 0.5;
  }
  /**
   * This method is used to render the stereo effect once per frame.
   *
   * @param {NodeFrame} frame - The current node frame.
   */
  updateBefore(frame) {
    const { renderer } = frame;
    const { scene, camera, stereo, renderTarget } = this;
    _rendererState = RendererUtils.resetRendererState(renderer, _rendererState);
    this._pixelRatio = renderer.getPixelRatio();
    stereo.cameraL.coordinateSystem = renderer.coordinateSystem;
    stereo.cameraR.coordinateSystem = renderer.coordinateSystem;
    stereo.update(camera);
    const size = renderer.getSize(_size);
    this.setSize(size.width, size.height);
    renderer.autoClear = false;
    this._cameraNear.value = camera.near;
    this._cameraFar.value = camera.far;
    for (const name in this._previousTextures) {
      this.toggleTexture(name);
    }
    renderer.setRenderTarget(renderTarget);
    renderer.setMRT(this._mrt);
    renderer.clear();
    renderTarget.scissorTest = true;
    renderTarget.scissor.set(0, 0, renderTarget.width / 2, renderTarget.height);
    renderTarget.viewport.set(0, 0, renderTarget.width / 2, renderTarget.height);
    renderer.render(scene, stereo.cameraL);
    renderTarget.scissor.set(renderTarget.width / 2, 0, renderTarget.width / 2, renderTarget.height);
    renderTarget.viewport.set(renderTarget.width / 2, 0, renderTarget.width / 2, renderTarget.height);
    renderer.render(scene, stereo.cameraR);
    renderTarget.scissorTest = false;
    RendererUtils.restoreRendererState(renderer, _rendererState);
  }
}
export default StereoPassNode;
export const stereoPass = (scene, camera) => new StereoPassNode(scene, camera);
