import { RedFormat, RenderTarget, Vector2, RendererUtils, QuadMesh, TempNode, NodeMaterial, NodeUpdateType, UnsignedByteType } from "three/webgpu";
import { reference, viewZToPerspectiveDepth, logarithmicDepthToViewZ, getScreenPosition, getViewPosition, float, Break, Loop, int, max, abs, If, interleavedGradientNoise, screenCoordinate, Fn, passTexture, uv, uniform, perspectiveDepthToViewZ, orthographicDepthToViewZ, vec2, lightPosition, lightTargetPosition, fract, rand, mix } from "three/tsl";
const _quadMesh = /* @__PURE__ */ new QuadMesh();
const _size = /* @__PURE__ */ new Vector2();
const _spatialOffsets = [0, 0.5, 0.25, 0.75];
let _rendererState;
class SSSNode extends TempNode {
  static get type() {
    return "SSSNode";
  }
  /**
   * Constructs a new SSS node.
   *
   * @param {TextureNode} depthNode - A texture node that represents the scene's depth.
   * @param {Camera} camera - The camera the scene is rendered with.
   * @param {DirectionalLight} mainLight - The main directional light of the scene.
   */
  constructor(depthNode, camera, mainLight) {
    super("float");
    this.depthNode = depthNode;
    this.maxDistance = uniform(0.1, "float");
    this.thickness = uniform(0.01, "float");
    this.shadowIntensity = uniform(1, "float");
    this.quality = uniform(0.5);
    this.resolutionScale = 1;
    this.useTemporalFiltering = false;
    this.updateBeforeType = NodeUpdateType.FRAME;
    this._cameraViewMatrix = uniform(camera.matrixWorldInverse);
    this._cameraProjectionMatrix = uniform(camera.projectionMatrix);
    this._cameraProjectionMatrixInverse = uniform(camera.projectionMatrixInverse);
    this._cameraNear = reference("near", "float", camera);
    this._cameraFar = reference("far", "float", camera);
    this._resolution = uniform(new Vector2());
    this._temporalOffset = uniform(0);
    this._frameId = uniform(0);
    this._mainLight = mainLight;
    this._camera = camera;
    this._sssRenderTarget = new RenderTarget(1, 1, { depthBuffer: false, format: RedFormat, type: UnsignedByteType });
    this._sssRenderTarget.texture.name = "SSS";
    this._material = new NodeMaterial();
    this._material.name = "SSS";
    this._textureNode = passTexture(this, this._sssRenderTarget.texture);
  }
  /**
   * Returns the result of the effect as a texture node.
   *
   * @return {PassTextureNode} A texture node that represents the result of the effect.
   */
  getTextureNode() {
    return this._textureNode;
  }
  /**
   * Sets the size of the effect.
   *
   * @param {number} width - The width of the effect.
   * @param {number} height - The height of the effect.
   */
  setSize(width, height) {
    width = Math.round(this.resolutionScale * width);
    height = Math.round(this.resolutionScale * height);
    this._resolution.value.set(width, height);
    this._sssRenderTarget.setSize(width, height);
  }
  /**
   * This method is used to render the effect once per frame.
   *
   * @param {NodeFrame} frame - The current node frame.
   */
  updateBefore(frame) {
    const { renderer } = frame;
    _rendererState = RendererUtils.resetRendererState(renderer, _rendererState);
    const size = renderer.getDrawingBufferSize(_size);
    this.setSize(size.width, size.height);
    if (this.useTemporalFiltering === true) {
      const frameId = frame.frameId;
      this._temporalOffset.value = _spatialOffsets[frameId % 4];
      this._frameId = frame.frameId;
    } else {
      this._temporalOffset.value = 0;
      this._frameId = 0;
    }
    _quadMesh.material = this._material;
    _quadMesh.name = "SSS";
    renderer.setClearColor(16777215, 1);
    renderer.setRenderTarget(this._sssRenderTarget);
    _quadMesh.render(renderer);
    RendererUtils.restoreRendererState(renderer, _rendererState);
  }
  /**
   * This method is used to setup the effect's TSL code.
   *
   * @param {NodeBuilder} builder - The current node builder.
   * @return {PassTextureNode}
   */
  setup(builder) {
    const uvNode = uv();
    const getViewZ = Fn(([depth]) => {
      let viewZNode;
      if (this._camera.isPerspectiveCamera) {
        viewZNode = perspectiveDepthToViewZ(depth, this._cameraNear, this._cameraFar);
      } else {
        viewZNode = orthographicDepthToViewZ(depth, this._cameraNear, this._cameraFar);
      }
      return viewZNode;
    });
    const sampleDepth = (uv2) => {
      const depth = this.depthNode.sample(uv2).r;
      if (builder.renderer.logarithmicDepthBuffer === true) {
        const viewZ = logarithmicDepthToViewZ(depth, this._cameraNear, this._cameraFar);
        return viewZToPerspectiveDepth(viewZ, this._cameraNear, this._cameraFar);
      }
      return depth;
    };
    const sss2 = Fn(() => {
      const depth = sampleDepth(uvNode).toVar();
      depth.greaterThanEqual(1).discard();
      const rayStartPosition = getViewPosition(uvNode, depth, this._cameraProjectionMatrixInverse).toVar("rayStartPosition");
      const rayDirection = this._cameraViewMatrix.transformDirection(lightPosition(this._mainLight).sub(lightTargetPosition(this._mainLight))).toConst("rayDirection");
      const rayEndPosition = rayStartPosition.add(rayDirection.mul(this.maxDistance)).toConst("rayEndPosition");
      const d0 = screenCoordinate.xy.toVar();
      const d1 = getScreenPosition(rayEndPosition, this._cameraProjectionMatrix).mul(this._resolution).toVar();
      const totalLen = d1.sub(d0).length().toVar();
      const xLen = d1.x.sub(d0.x).toVar();
      const yLen = d1.y.sub(d0.y).toVar();
      const totalStep = int(max(abs(xLen), abs(yLen)).mul(this.quality.clamp())).toConst();
      const xSpan = xLen.div(totalStep).toVar();
      const ySpan = yLen.div(totalStep).toVar();
      const noise = interleavedGradientNoise(screenCoordinate);
      const offset = fract(noise.add(this._temporalOffset)).add(rand(uvNode.add(this._frameId))).toConst("offset");
      const occlusion = float(0).toVar();
      Loop(totalStep, ({ i }) => {
        const xy = vec2(d0.x.add(xSpan.mul(float(i).add(offset))), d0.y.add(ySpan.mul(float(i).add(offset)))).toVar();
        If(xy.x.lessThan(0).or(xy.x.greaterThan(this._resolution.x)).or(xy.y.lessThan(0)).or(xy.y.greaterThan(this._resolution.y)), () => {
          Break();
        });
        const uvNode2 = xy.div(this._resolution);
        const fragmentDepth = sampleDepth(uvNode2).toConst();
        const fragmentViewZ = getViewZ(fragmentDepth).toConst("fragmentViewZ");
        const s = xy.sub(d0).length().div(totalLen).toVar();
        const rayPosition = mix(rayStartPosition, rayEndPosition, s);
        const depthDelta = rayPosition.z.sub(fragmentViewZ).negate();
        If(depthDelta.greaterThan(0).and(depthDelta.lessThan(this.thickness)), () => {
          occlusion.assign(this.shadowIntensity);
          Break();
        });
      });
      return occlusion.oneMinus();
    });
    this._material.fragmentNode = sss2().context(builder.getSharedContext());
    this._material.needsUpdate = true;
    return this._textureNode;
  }
  /**
   * Frees internal resources. This method should be called
   * when the effect is no longer required.
   */
  dispose() {
    this._sssRenderTarget.dispose();
    this._material.dispose();
  }
}
export default SSSNode;
export const sss = (depthNode, camera, mainLight) => new SSSNode(depthNode, camera, mainLight);
