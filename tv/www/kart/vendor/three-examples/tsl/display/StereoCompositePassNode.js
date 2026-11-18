import { RenderTarget, StereoCamera, HalfFloatType, LinearFilter, NearestFilter, Vector2, PassNode, QuadMesh, RendererUtils } from "three/webgpu";
import { texture } from "three/tsl";
const _size = /* @__PURE__ */ new Vector2();
const _quadMesh = /* @__PURE__ */ new QuadMesh();
let _rendererState;
class StereoCompositePassNode extends PassNode {
  static get type() {
    return "StereoCompositePassNode";
  }
  /**
   * Constructs a new stereo composite pass node.
   *
   * @param {Scene} scene - The scene to render.
   * @param {Camera} camera - The camera to render the scene with.
   */
  constructor(scene, camera) {
    super(PassNode.COLOR, scene, camera);
    this.isStereoCompositePassNode = true;
    this.stereo = new StereoCamera();
    const _params = { minFilter: LinearFilter, magFilter: NearestFilter, type: HalfFloatType };
    this._renderTargetL = new RenderTarget(1, 1, _params);
    this._renderTargetR = new RenderTarget(1, 1, _params);
    this._mapLeft = texture(this._renderTargetL.texture);
    this._mapRight = texture(this._renderTargetR.texture);
    this._material = null;
  }
  /**
   * Updates the internal stereo camera.
   *
   * @param {number} coordinateSystem - The current coordinate system.
   */
  updateStereoCamera(coordinateSystem) {
    this.stereo.cameraL.coordinateSystem = coordinateSystem;
    this.stereo.cameraR.coordinateSystem = coordinateSystem;
    this.stereo.update(this.camera);
  }
  /**
   * Sets the size of the pass.
   *
   * @param {number} width - The width of the pass.
   * @param {number} height - The height of the pass.
   */
  setSize(width, height) {
    super.setSize(width, height);
    this._renderTargetL.setSize(this.renderTarget.width, this.renderTarget.height);
    this._renderTargetR.setSize(this.renderTarget.width, this.renderTarget.height);
  }
  /**
   * This method is used to render the effect once per frame.
   *
   * @param {NodeFrame} frame - The current node frame.
   */
  updateBefore(frame) {
    const { renderer } = frame;
    const { scene, stereo, renderTarget } = this;
    _rendererState = RendererUtils.resetRendererState(renderer, _rendererState);
    this._pixelRatio = renderer.getPixelRatio();
    this.updateStereoCamera(renderer.coordinateSystem);
    const size = renderer.getSize(_size);
    this.setSize(size.width, size.height);
    renderer.setRenderTarget(this._renderTargetL);
    renderer.render(scene, stereo.cameraL);
    renderer.setRenderTarget(this._renderTargetR);
    renderer.render(scene, stereo.cameraR);
    renderer.setRenderTarget(renderTarget);
    _quadMesh.material = this._material;
    _quadMesh.render(renderer);
    RendererUtils.restoreRendererState(renderer, _rendererState);
  }
  /**
   * Frees internal resources. This method should be called
   * when the pass is no longer required.
   */
  dispose() {
    super.dispose();
    this._renderTargetL.dispose();
    this._renderTargetR.dispose();
    if (this._material !== null) {
      this._material.dispose();
    }
  }
}
export default StereoCompositePassNode;
