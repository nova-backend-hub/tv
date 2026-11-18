import { HalfFloatType, Vector2, RenderTarget, RendererUtils, QuadMesh, NodeMaterial, TempNode, NodeUpdateType, Matrix4, DepthTexture } from "three/webgpu";
import { add, exp, float, If, Fn, max, texture, uniform, uv, vec2, vec4, luminance, convertToTexture, passTexture, velocity, getViewPosition, viewZToPerspectiveDepth, struct, ivec2, mix, property, outputStruct } from "three/tsl";
const _quadMesh = /* @__PURE__ */ new QuadMesh();
const _size = /* @__PURE__ */ new Vector2();
let _rendererState;
class TAAUNode extends TempNode {
  static get type() {
    return "TAAUNode";
  }
  /**
   * Constructs a new TAAU node.
   *
   * @param {TextureNode} beautyNode - The texture node that represents the input of the effect.
   * @param {TextureNode} depthNode - A node that represents the scene's depth.
   * @param {TextureNode} velocityNode - A node that represents the scene's velocity.
   * @param {Camera} camera - The camera the scene is rendered with.
   */
  constructor(beautyNode, depthNode, velocityNode, camera) {
    super("vec4");
    this.isTAAUNode = true;
    this.updateBeforeType = NodeUpdateType.FRAME;
    this.beautyNode = beautyNode;
    this.depthNode = depthNode;
    this.velocityNode = velocityNode;
    this.camera = camera;
    this.depthThreshold = 5e-4;
    this.edgeDepthDiff = 1e-3;
    this.maxVelocityLength = 128;
    this.currentFrameWeight = 0.025;
    this._jitterIndex = 0;
    this._jitterOffset = uniform(new Vector2());
    this._historyRenderTarget = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType, count: 2 });
    this._historyRenderTarget.textures[0].name = "TAAUNode.history.color";
    this._historyRenderTarget.textures[1].name = "TAAUNode.history.lock";
    this._resolveRenderTarget = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
    this._resolveRenderTarget.texture.name = "TAAUNode.resolve";
    this._previousDepthRenderTarget = new RenderTarget(1, 1, { depthBuffer: false, depthTexture: new DepthTexture() });
    this._previousDepthRenderTarget.depthTexture.name = "TAAUNode.previousDepth";
    this._resolveMaterial = new NodeMaterial();
    this._resolveMaterial.name = "TAAU.resolve";
    this._seedMaterial = new NodeMaterial();
    this._seedMaterial.name = "TAAU.seed";
    this._textureNode = passTexture(this, this._resolveRenderTarget.texture);
    this._originalProjectionMatrix = new Matrix4();
    this._cameraNearFar = uniform(new Vector2());
    this._cameraWorldMatrix = uniform(new Matrix4());
    this._cameraWorldMatrixInverse = uniform(new Matrix4());
    this._cameraProjectionMatrixInverse = uniform(new Matrix4());
    this._previousCameraWorldMatrix = uniform(new Matrix4());
    this._previousCameraProjectionMatrixInverse = uniform(new Matrix4());
    this._previousDepthNode = texture(this._previousDepthRenderTarget.depthTexture);
    this._needsPostProcessingSync = false;
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
   * Sets the output size of the effect (history and resolve targets). The
   * previous-depth texture is sized independently in `updateBefore()` to
   * track the scene's current depth texture.
   *
   * @param {number} outputWidth - The output width (drawing buffer width).
   * @param {number} outputHeight - The output height (drawing buffer height).
   */
  setSize(outputWidth, outputHeight) {
    this._historyRenderTarget.setSize(outputWidth, outputHeight);
    this._resolveRenderTarget.setSize(outputWidth, outputHeight);
  }
  /**
   * Defines the TAAU's current jitter as a view offset to the scene's
   * camera. The jitter is shrunk to one *output* pixel (rather than one
   * input pixel) so that the halton sequence gradually fills the output
   * sub-pixel grid over multiple frames.
   *
   * @param {number} inputWidth - The width of the input buffers the camera renders into.
   * @param {number} inputHeight - The height of the input buffers the camera renders into.
   */
  setViewOffset(inputWidth, inputHeight) {
    this.camera.updateProjectionMatrix();
    this._originalProjectionMatrix.copy(this.camera.projectionMatrix);
    velocity.setProjectionMatrix(this._originalProjectionMatrix);
    const haltonOffset = _haltonOffsets[this._jitterIndex];
    const jitterX = haltonOffset[0] - 0.5;
    const jitterY = haltonOffset[1] - 0.5;
    this._jitterOffset.value.set(jitterX, jitterY);
    this.camera.setViewOffset(
      inputWidth,
      inputHeight,
      jitterX,
      jitterY,
      inputWidth,
      inputHeight
    );
  }
  /**
   * Clears the view offset from the scene's camera.
   */
  clearViewOffset() {
    this.camera.clearViewOffset();
    velocity.setProjectionMatrix(null);
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
    const inputWidth = beautyRenderTarget.texture.width;
    const inputHeight = beautyRenderTarget.texture.height;
    const drawingBufferSize = renderer.getDrawingBufferSize(_size);
    const outputWidth = drawingBufferSize.width;
    const outputHeight = drawingBufferSize.height;
    _rendererState = RendererUtils.resetRendererState(renderer, _rendererState);
    const needsRestart = this._historyRenderTarget.width !== outputWidth || this._historyRenderTarget.height !== outputHeight;
    this.setSize(outputWidth, outputHeight);
    if (needsRestart === true) {
      renderer.initRenderTarget(this._historyRenderTarget);
      renderer.initRenderTarget(this._resolveRenderTarget);
      renderer.setRenderTarget(this._historyRenderTarget);
      _quadMesh.material = this._seedMaterial;
      _quadMesh.name = "TAAU.seed";
      _quadMesh.render(renderer);
      renderer.setRenderTarget(null);
    }
    if (this._needsPostProcessingSync === true) {
      this.setViewOffset(inputWidth, inputHeight);
      this._needsPostProcessingSync = false;
    }
    renderer.setRenderTarget(this._resolveRenderTarget);
    _quadMesh.material = this._resolveMaterial;
    _quadMesh.name = "TAAU";
    _quadMesh.render(renderer);
    renderer.setRenderTarget(null);
    renderer.copyTextureToTexture(this._resolveRenderTarget.texture, this._historyRenderTarget.texture);
    const currentDepth = this.depthNode.value;
    const srcW = currentDepth.image !== null && currentDepth.image !== void 0 ? currentDepth.image.width : 0;
    const srcH = currentDepth.image !== null && currentDepth.image !== void 0 ? currentDepth.image.height : 0;
    if (srcW > 0 && srcH > 0) {
      if (this._previousDepthRenderTarget.width !== srcW || this._previousDepthRenderTarget.height !== srcH) {
        this._previousDepthRenderTarget.setSize(srcW, srcH);
        renderer.initRenderTarget(this._previousDepthRenderTarget);
      }
      const dstDepth = this._previousDepthRenderTarget.depthTexture;
      renderer.copyTextureToTexture(currentDepth, dstDepth);
      this._previousDepthNode.value = dstDepth;
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
        const beautyRenderTarget = this.beautyNode.isRTTNode ? this.beautyNode.renderTarget : this.beautyNode.passNode.renderTarget;
        const inputWidth = beautyRenderTarget.texture.width;
        const inputHeight = beautyRenderTarget.texture.height;
        this.setViewOffset(inputWidth, inputHeight);
      };
      renderPipeline.context.onAfterRenderPipeline = () => {
        this.clearViewOffset();
      };
    }
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
          const depth = this.depthNode.load(neighbor).r.toVar();
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
      const depth = this._previousDepthNode.sample(uv2).r;
      const positionView = getViewPosition(uv2, depth, this._previousCameraProjectionMatrixInverse);
      const positionWorld = this._previousCameraWorldMatrix.mul(vec4(positionView, 1)).xyz;
      const viewZ = this._cameraWorldMatrixInverse.mul(vec4(positionWorld, 1)).z;
      return viewZToPerspectiveDepth(viewZ, this._cameraNearFar.x, this._cameraNearFar.y);
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
    const historyNode = texture(this._historyRenderTarget.textures[0]);
    const lockNode = texture(this._historyRenderTarget.textures[1]);
    const colorOutput = property("vec4");
    const lockOutput = property("vec4");
    const outputNode = outputStruct(colorOutput, lockOutput);
    const resolve = Fn(() => {
      const uvNode = uv();
      const inputSize = this.beautyNode.size();
      const inputSizeF = vec2(inputSize);
      const pIn = uvNode.mul(inputSizeF);
      const closestTapF = pIn.sub(vec2(0.5).add(this._jitterOffset)).round();
      const closestTap = ivec2(closestTapF);
      const currentDepth = sampleCurrentDepth(closestTapF);
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
      const sumColor = vec4(0).toVar();
      const sumWeight = float(0).toVar();
      const moment1 = vec4(0).toVar();
      const moment2 = vec4(0).toVar();
      const offsets = [
        [-1, -1],
        [0, -1],
        [1, -1],
        [-1, 0],
        [0, 0],
        [1, 0],
        [-1, 1],
        [0, 1],
        [1, 1]
      ];
      for (const [x, y] of offsets) {
        const tap = closestTap.add(ivec2(x, y));
        const tapCenter = vec2(tap).add(vec2(0.5).add(this._jitterOffset));
        const delta = pIn.sub(tapCenter);
        const d2 = delta.dot(delta);
        const w = exp(d2.mul(-2.29));
        const c = this.beautyNode.load(tap).max(0);
        sumColor.addAssign(c.mul(w));
        sumWeight.addAssign(w);
        moment1.addAssign(c);
        moment2.addAssign(c.pow2());
      }
      const currentColor = sumColor.div(sumWeight.max(1e-5));
      const N = float(offsets.length);
      const mean = moment1.div(N);
      const motionFactor = uvNode.sub(historyUV).mul(inputSizeF).length().div(this.maxVelocityLength).saturate();
      const varianceGamma = mix(0.5, 1, motionFactor.oneMinus().pow2());
      const variance = moment2.div(N).sub(mean.pow2()).max(0).sqrt().mul(varianceGamma);
      const minColor = mean.sub(variance);
      const maxColor = mean.add(variance);
      const historyColor = historyNode.sample(historyUV);
      const clippedHistoryColor = clipAABB(mean.clamp(minColor, maxColor), historyColor, minColor, maxColor);
      const currentLuma = luminance(currentColor.rgb);
      const meanLuma = luminance(mean.rgb).toConst();
      const thinFeature = currentLuma.sub(meanLuma).abs().div(meanLuma).smoothstep(0, 0.2);
      const isDepthChanged = closestDepth.sub(previousDepth).abs().greaterThan(this.depthThreshold);
      const canLock = isValidUV.and(isDepthChanged.not());
      const gatedThinFeature = canLock.select(thinFeature, float(0));
      const decay = isDisocclusion.select(0, 0.5);
      const lock = max(gatedThinFeature, lockNode.r.mul(decay)).saturate();
      const lockedHistoryColor = mix(clippedHistoryColor, historyColor, lock);
      const currentWeight = float(this.currentFrameWeight).toVar();
      currentWeight.assign(hasValidHistory.select(currentWeight.add(motionFactor).saturate(), 1));
      const output = flickerReduction(currentColor, lockedHistoryColor, currentWeight);
      colorOutput.assign(output);
      lockOutput.assign(lock);
      return vec4(0);
    });
    this._resolveMaterial.colorNode = resolve();
    this._resolveMaterial.outputNode = outputNode;
    this._seedMaterial.colorNode = Fn(() => {
      colorOutput.assign(this.beautyNode.sample(uv()));
      lockOutput.assign(0);
      return vec4(0);
    })();
    this._seedMaterial.outputNode = outputNode;
    return this._textureNode;
  }
  /**
   * Frees internal resources. This method should be called
   * when the effect is no longer required.
   */
  dispose() {
    this._historyRenderTarget.dispose();
    this._resolveRenderTarget.dispose();
    this._previousDepthRenderTarget.dispose();
    this._resolveMaterial.dispose();
    this._seedMaterial.dispose();
  }
}
export default TAAUNode;
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
export const taau = (beautyNode, depthNode, velocityNode, camera) => new TAAUNode(convertToTexture(beautyNode), depthNode, velocityNode, camera);
