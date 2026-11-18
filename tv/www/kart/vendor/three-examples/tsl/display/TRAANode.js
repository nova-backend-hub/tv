import { HalfFloatType, Vector2, RenderTarget, RendererUtils, QuadMesh, NodeMaterial, TempNode, NodeUpdateType, Matrix4, DepthTexture, FloatType } from "three/webgpu";
import { add, float, If, Fn, max, texture, uniform, uv, vec2, vec4, luminance, convertToTexture, passTexture, velocity, getViewPosition, viewZToPerspectiveDepth, struct, ivec2, mix, logarithmicDepthToViewZ, viewZToOrthographicDepth } from "three/tsl";
const _quadMesh = /* @__PURE__ */ new QuadMesh();
const _size = /* @__PURE__ */ new Vector2();
let _rendererState;
class TRAANode extends TempNode {
  static get type() {
    return "TRAANode";
  }
  /**
   * Constructs a new TRAA node.
   *
   * @param {TextureNode} beautyNode - The texture node that represents the input of the effect.
   * @param {TextureNode} depthNode - A node that represents the scene's depth.
   * @param {TextureNode} velocityNode - A node that represents the scene's velocity.
   * @param {Camera} camera - The camera the scene is rendered with.
   */
  constructor(beautyNode, depthNode, velocityNode, camera) {
    super("vec4");
    this.isTRAANode = true;
    this.updateBeforeType = NodeUpdateType.FRAME;
    this.beautyNode = beautyNode;
    this.depthNode = depthNode;
    this.velocityNode = velocityNode;
    this.camera = camera;
    this.depthThreshold = 5e-4;
    this.edgeDepthDiff = 1e-3;
    this.maxVelocityLength = 128;
    this.useSubpixelCorrection = true;
    this._jitterIndex = 0;
    this._invSize = uniform(new Vector2());
    this._historyRenderTarget = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType, depthTexture: new DepthTexture() });
    this._historyRenderTarget.texture.name = "TRAANode.history";
    this._resolveRenderTarget = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
    this._resolveRenderTarget.texture.name = "TRAANode.resolve";
    this._resolveMaterial = new NodeMaterial();
    this._resolveMaterial.name = "TRAA.resolve";
    this._textureNode = passTexture(this, this._resolveRenderTarget.texture);
    this._originalProjectionMatrix = new Matrix4();
    this._cameraNearFar = uniform(new Vector2());
    this._cameraWorldMatrix = uniform(new Matrix4());
    this._cameraWorldMatrixInverse = uniform(new Matrix4());
    this._cameraProjectionMatrixInverse = uniform(new Matrix4());
    this._previousCameraWorldMatrix = uniform(new Matrix4());
    this._previousCameraProjectionMatrixInverse = uniform(new Matrix4());
    this._previousDepthNode = texture(new DepthTexture(1, 1));
    this._needsPostProcessingSync = false;
    this._velocityNode = null;
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
    this._historyRenderTarget.setSize(width, height);
    this._resolveRenderTarget.setSize(width, height);
    this._invSize.value.set(1 / width, 1 / height);
  }
  /**
   * Defines the TRAA's current jitter as a view offset
   * to the scene's camera.
   *
   * @param {number} width - The width of the effect.
   * @param {number} height - The height of the effect.
   */
  setViewOffset(width, height) {
    this.camera.updateProjectionMatrix();
    this._originalProjectionMatrix.copy(this.camera.projectionMatrix);
    this._velocityNode.setProjectionMatrix(this._originalProjectionMatrix);
    const viewOffset = {
      fullWidth: width,
      fullHeight: height,
      offsetX: 0,
      offsetY: 0,
      width,
      height
    };
    const jitterOffset = _haltonOffsets[this._jitterIndex];
    this.camera.setViewOffset(
      viewOffset.fullWidth,
      viewOffset.fullHeight,
      viewOffset.offsetX + jitterOffset[0] - 0.5,
      viewOffset.offsetY + jitterOffset[1] - 0.5,
      viewOffset.width,
      viewOffset.height
    );
  }
  /**
   * Clears the view offset from the scene's camera.
   */
  clearViewOffset() {
    this.camera.clearViewOffset();
    this._velocityNode.setProjectionMatrix(null);
    this._jitterIndex++;
    this._jitterIndex = this._jitterIndex % (_haltonOffsets.length - 1);
  }
  /**
   * This method is used to render the effect once per frame.
   *
   * @param {NodeFrame} frame - The current node frame.
   */
  updateBefore(frame) {
    const { renderer } = frame;
    this._previousCameraWorldMatrix.value.copy(this._cameraWorldMatrix.value);
    this._previousCameraProjectionMatrixInverse.value.copy(this._cameraProjectionMatrixInverse.value);
    this._cameraNearFar.value.set(this.camera.near, this.camera.far);
    this._cameraWorldMatrix.value.copy(this.camera.matrixWorld);
    this._cameraWorldMatrixInverse.value.copy(this.camera.matrixWorldInverse);
    this._cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse);
    const beautyRenderTarget = this.beautyNode.isRTTNode ? this.beautyNode.renderTarget : this.beautyNode.passNode.renderTarget;
    const width = beautyRenderTarget.texture.width;
    const height = beautyRenderTarget.texture.height;
    if (this._needsPostProcessingSync === true) {
      this.setViewOffset(width, height);
      this._needsPostProcessingSync = false;
    }
    _rendererState = RendererUtils.resetRendererState(renderer, _rendererState);
    const needsRestart = this._historyRenderTarget.width !== width || this._historyRenderTarget.height !== height;
    this.setSize(width, height);
    if (needsRestart === true) {
      renderer.initRenderTarget(this._historyRenderTarget);
      renderer.initRenderTarget(this._resolveRenderTarget);
      renderer.copyTextureToTexture(beautyRenderTarget.texture, this._historyRenderTarget.texture);
    }
    renderer.setRenderTarget(this._resolveRenderTarget);
    _quadMesh.material = this._resolveMaterial;
    _quadMesh.name = "TRAA";
    _quadMesh.render(renderer);
    renderer.setRenderTarget(null);
    renderer.copyTextureToTexture(this._resolveRenderTarget.texture, this._historyRenderTarget.texture);
    const size = renderer.getDrawingBufferSize(_size);
    if (this._historyRenderTarget.height === size.height && this._historyRenderTarget.width === size.width) {
      const currentDepth = this.depthNode.value;
      renderer.copyTextureToTexture(currentDepth, this._historyRenderTarget.depthTexture);
      this._previousDepthNode.value = this._historyRenderTarget.depthTexture;
    }
    RendererUtils.restoreRendererState(renderer, _rendererState);
  }
  /**
   * This method is used to setup the effect's render targets and TSL code.
   *
   * @param {NodeBuilder} builder - The current node builder.
   * @return {PassTextureNode}
   */
  setup(builder) {
    const renderPipeline = builder.context.renderPipeline;
    if (renderPipeline) {
      this._needsPostProcessingSync = true;
      renderPipeline.context.onBeforeRenderPipeline = () => {
        const size = builder.renderer.getDrawingBufferSize(_size);
        this.setViewOffset(size.width, size.height);
      };
      renderPipeline.context.onAfterRenderPipeline = () => {
        this.clearViewOffset();
      };
    }
    if (builder.renderer.reversedDepthBuffer === true) {
      this._historyRenderTarget.depthTexture.type = FloatType;
    }
    if (builder.context.velocity !== void 0) {
      this._velocityNode = builder.context.velocity;
    } else {
      this._velocityNode = velocity;
    }
    const logarithmicToPerspectiveDepth = (depth) => {
      const { x: near, y: far } = this._cameraNearFar;
      const viewZ = logarithmicDepthToViewZ(depth, near, far);
      return viewZToPerspectiveDepth(viewZ, near, far);
    };
    const currentDepthStruct = struct({
      closestDepth: "float",
      closestPositionTexel: "vec2",
      farthestDepth: "float"
    });
    const sampleCurrentDepth = Fn(([positionTexel]) => {
      const closestDepth = float(2).toVar();
      const closestPositionTexel = vec2(0).toVar();
      const farthestDepth = float(-1).toVar();
      for (let x = -1; x <= 1; ++x) {
        for (let y = -1; y <= 1; ++y) {
          const neighbor = positionTexel.add(vec2(x, y)).toVar();
          let depth = this.depthNode.load(neighbor).r;
          if (builder.renderer.reversedDepthBuffer) depth = depth.oneMinus();
          if (builder.renderer.logarithmicDepthBuffer) depth = logarithmicToPerspectiveDepth(depth);
          depth = depth.toVar();
          If(depth.lessThan(closestDepth), () => {
            closestDepth.assign(depth);
            closestPositionTexel.assign(neighbor);
          });
          If(depth.greaterThan(farthestDepth), () => {
            farthestDepth.assign(depth);
          });
        }
      }
      return currentDepthStruct(closestDepth, closestPositionTexel, farthestDepth);
    });
    const samplePreviousDepth = (uv2) => {
      let depth = this._previousDepthNode.sample(uv2).r;
      if (builder.renderer.logarithmicDepthBuffer) depth = logarithmicToPerspectiveDepth(depth);
      const positionView = getViewPosition(uv2, depth, this._previousCameraProjectionMatrixInverse);
      const positionWorld = this._previousCameraWorldMatrix.mul(vec4(positionView, 1)).xyz;
      const viewZ = this._cameraWorldMatrixInverse.mul(vec4(positionWorld, 1)).z;
      return this.camera.isOrthographicCamera ? viewZToOrthographicDepth(viewZ, this._cameraNearFar.x, this._cameraNearFar.y) : viewZToPerspectiveDepth(viewZ, this._cameraNearFar.x, this._cameraNearFar.y);
    };
    const clipAABB = Fn(([currentColor, historyColor, minColor, maxColor]) => {
      const pClip = maxColor.rgb.add(minColor.rgb).mul(0.5);
      const eClip = maxColor.rgb.sub(minColor.rgb).mul(0.5).add(1e-7);
      const vClip = historyColor.sub(vec4(pClip, currentColor.a));
      const vUnit = vClip.xyz.div(eClip);
      const absUnit = vUnit.abs();
      const maxUnit = max(absUnit.x, absUnit.y, absUnit.z);
      return maxUnit.greaterThan(1).select(
        vec4(pClip, currentColor.a).add(vClip.div(maxUnit)),
        historyColor
      );
    }).setLayout({
      name: "clipAABB",
      type: "vec4",
      inputs: [
        { name: "currentColor", type: "vec4" },
        { name: "historyColor", type: "vec4" },
        { name: "minColor", type: "vec4" },
        { name: "maxColor", type: "vec4" }
      ]
    });
    const varianceClipping = Fn(([positionTexel, currentColor, historyColor, gamma]) => {
      const offsets = [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
        [1, 0],
        [0, -1],
        [0, 1],
        [-1, 0]
      ];
      const moment1 = currentColor.toVar();
      const moment2 = currentColor.pow2().toVar();
      for (const [x, y] of offsets) {
        const neighbor = this.beautyNode.offset(ivec2(x, y)).load(positionTexel).max(0);
        moment1.addAssign(neighbor);
        moment2.addAssign(neighbor.pow2());
      }
      const N = float(offsets.length + 1);
      const mean = moment1.div(N);
      const variance = moment2.div(N).sub(mean.pow2()).max(0).sqrt().mul(gamma);
      const minColor = mean.sub(variance);
      const maxColor = mean.add(variance);
      return clipAABB(mean.clamp(minColor, maxColor), historyColor, minColor, maxColor);
    });
    const subpixelCorrection = Fn(([velocityUV, textureSize]) => {
      const velocityTexel = velocityUV.mul(textureSize);
      const phase = velocityTexel.fract().abs();
      const weight = max(phase, phase.oneMinus());
      return weight.x.mul(weight.y).oneMinus().div(0.75);
    }).setLayout({
      name: "subpixelCorrection",
      type: "float",
      inputs: [
        { name: "velocityUV", type: "vec2" },
        { name: "textureSize", type: "ivec2" }
      ]
    });
    const flickerReduction = Fn(([currentColor, historyColor, currentWeight]) => {
      const historyWeight = currentWeight.oneMinus();
      const compressedCurrent = currentColor.mul(float(1).div(max(currentColor.r, currentColor.g, currentColor.b).add(1)));
      const compressedHistory = historyColor.mul(float(1).div(max(historyColor.r, historyColor.g, historyColor.b).add(1)));
      const luminanceCurrent = luminance(compressedCurrent.rgb);
      const luminanceHistory = luminance(compressedHistory.rgb);
      currentWeight.mulAssign(float(1).div(luminanceCurrent.add(1)));
      historyWeight.mulAssign(float(1).div(luminanceHistory.add(1)));
      return add(currentColor.mul(currentWeight), historyColor.mul(historyWeight)).div(max(currentWeight.add(historyWeight), 1e-5)).toVar();
    });
    const historyNode = texture(this._historyRenderTarget.texture);
    const resolve = Fn(() => {
      const uvNode = uv();
      const textureSize = this.beautyNode.size();
      const positionTexel = uvNode.mul(textureSize);
      const currentDepth = sampleCurrentDepth(positionTexel);
      const closestDepth = currentDepth.get("closestDepth");
      const closestPositionTexel = currentDepth.get("closestPositionTexel");
      const farthestDepth = currentDepth.get("farthestDepth");
      const offsetUV = this.velocityNode.load(closestPositionTexel).xy.mul(vec2(0.5, -0.5));
      const historyUV = uvNode.sub(offsetUV);
      const previousDepth = samplePreviousDepth(historyUV);
      const isValidUV = historyUV.greaterThanEqual(0).all().and(historyUV.lessThanEqual(1).all());
      const isEdge = farthestDepth.sub(closestDepth).greaterThan(this.edgeDepthDiff);
      const isDisocclusion = closestDepth.sub(previousDepth).greaterThan(this.depthThreshold);
      const hasValidHistory = isValidUV.and(isEdge.or(isDisocclusion.not()));
      const currentColor = this.beautyNode.sample(uvNode);
      const historyColor = historyNode.sample(uvNode.sub(offsetUV));
      const motionFactor = uvNode.sub(historyUV).mul(textureSize).length().div(this.maxVelocityLength).saturate();
      const currentWeight = float(0.05).toVar();
      if (this.useSubpixelCorrection) {
        currentWeight.addAssign(subpixelCorrection(offsetUV, textureSize).mul(0.25));
      }
      currentWeight.assign(hasValidHistory.select(currentWeight.add(motionFactor).saturate(), 1));
      const varianceGamma = mix(0.5, 1, motionFactor.oneMinus().pow2());
      const clippedHistoryColor = varianceClipping(positionTexel, currentColor, historyColor, varianceGamma);
      const output = flickerReduction(currentColor, clippedHistoryColor, currentWeight);
      return output;
    });
    this._resolveMaterial.colorNode = resolve();
    return this._textureNode;
  }
  /**
   * Frees internal resources. This method should be called
   * when the effect is no longer required.
   */
  dispose() {
    this._historyRenderTarget.dispose();
    this._resolveRenderTarget.dispose();
    this._resolveMaterial.dispose();
  }
}
export default TRAANode;
function _halton(index, base) {
  let fraction = 1;
  let result = 0;
  while (index > 0) {
    fraction /= base;
    result += fraction * (index % base);
    index = Math.floor(index / base);
  }
  return result;
}
const _haltonOffsets = /* @__PURE__ */ Array.from(
  { length: 32 },
  (_, index) => [_halton(index + 1, 2), _halton(index + 1, 3)]
);
export const traa = (beautyNode, depthNode, velocityNode, camera) => new TRAANode(convertToTexture(beautyNode), depthNode, velocityNode, camera);
