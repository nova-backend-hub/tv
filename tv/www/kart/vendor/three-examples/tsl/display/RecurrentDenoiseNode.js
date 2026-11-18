import { abs, atan, bool, convertToTexture, cos, cross, Discard, dot, EPSILON, exp, float, Fn, getScreenPosition, getViewPosition, If, int, log, Loop, luminance, mat2, max, mix, nodeObject, NodeUpdateType, normalize, passTexture, PI, property, reflect, sin, smoothstep, sqrt, tan, texture, uniform, unpackRGBToNormal, uv, vec2, vec3, vec4 } from "three/tsl";
import { HalfFloatType, MathUtils, Matrix4, NodeMaterial, QuadMesh, RendererUtils, RenderTarget, TempNode, Vector2 } from "three/webgpu";
import { bindAnalyticNoise } from "../utils/RNoise.js";
import { ENV_RAY_LENGTH_THRESHOLD } from "../utils/SpecularHelpers.js";
const _quadMesh = /* @__PURE__ */ new QuadMesh();
const _size = /* @__PURE__ */ new Vector2();
let _rendererState;
const KERNEL_SAMPLES = 8;
const NOISE_ROTATION_SEED = 83;
const WORLD_RADIUS_SCALE = 0.1;
const AO_EDGE_STOPPING_BIAS = 0.05;
const AGGRESSIVITY_RADIUS_MIN = 1e-3;
const DIFFUSE_CHROMA_WEIGHT = 2;
const FLICKER_COV_GATE_MIN = 0.1;
const FLICKER_COV_GATE_MAX = 2;
const vogelDisk = Fn(([i, radius]) => {
  const sampleCount = 8;
  const theta = i.add(0.5).mul(2.399827721492203);
  const r = radius.mul(sqrt(i.add(0.5).div(sampleCount)));
  return vec2(cos(theta), sin(theta)).mul(r);
}).setLayout({
  name: "vogelDisk",
  type: "vec2",
  inputs: [
    { name: "i", type: "float" },
    { name: "radius", type: "float" }
  ]
});
const diffuseColorDistance = Fn(([a, b, compressLuma]) => {
  const toYCoCg = (c) => vec3(
    dot(c, vec3(0.25, 0.5, 0.25)),
    c.r.sub(c.b),
    c.g.sub(c.r.add(c.b).mul(0.5))
  );
  const ya = toYCoCg(a);
  const yb = toYCoCg(b);
  const compress = (L) => mix(L, log(L.add(1)), compressLuma);
  const dLuma = abs(compress(ya.x).sub(compress(yb.x)));
  const dChroma = vec2(ya.y.sub(yb.y), ya.z.sub(yb.z)).length();
  return dLuma.add(dChroma.mul(DIFFUSE_CHROMA_WEIGHT));
}).setLayout({
  name: "diffuseColorDistance",
  type: "float",
  inputs: [
    { name: "a", type: "vec3" },
    { name: "b", type: "vec3" },
    { name: "compressLuma", type: "float" }
  ]
});
const _temporalWeight = Fn(([x, strength]) => float(1).div(x.pow(strength))).setLayout({
  name: "temporalWeight",
  type: "float",
  inputs: [
    { name: "x", type: "float" },
    { name: "strength", type: "float" }
  ]
});
const getTemporalVarianceFactor = Fn(([frameNum, strength]) => {
  return _temporalWeight(frameNum, strength).max(0.05);
}).setLayout({
  name: "getTemporalVarianceFactor",
  type: "float",
  inputs: [
    { name: "frameNum", type: "float" },
    { name: "strength", type: "float" }
  ]
});
const computeFrustumSize = Fn(([viewZ, tanHalfFovY]) => {
  return float(2).mul(viewZ).mul(tanHalfFovY);
}).setLayout({
  name: "computeFrustumSize",
  type: "float",
  inputs: [
    { name: "viewZ", type: "float" },
    { name: "tanHalfFovY", type: "float" }
  ]
});
const computeHitDistFactor = Fn(([worldRayLength, viewZ, tanHalfFovY]) => {
  const frustumSize = computeFrustumSize(viewZ, tanHalfFovY);
  const factor = worldRayLength.div(frustumSize.max(1e-6)).clamp(0, 1);
  return factor;
}).setLayout({
  name: "computeHitDistFactor",
  type: "float",
  inputs: [
    { name: "worldRayLength", type: "float" },
    { name: "viewZ", type: "float" },
    { name: "tanHalfFovY", type: "float" }
  ]
});
const mapAo = Fn(([aoVal]) => aoVal.pow(0.1));
const getSpecularDominantDirection = Fn(([N, V, roughness]) => {
  return normalize(mix(N, reflect(V.negate(), N), roughness.oneMinus()));
}).setLayout({
  name: "getSpecularDominantDirection",
  type: "vec3",
  inputs: [
    { name: "N", type: "vec3" },
    { name: "V", type: "vec3" },
    { name: "roughness", type: "float" }
  ]
});
const specularLobeTanHalfAngle = Fn(([roughness, percent]) => {
  const alpha = roughness.mul(roughness);
  return alpha.mul(sqrt(percent.div(float(1).sub(percent).max(1e-6))));
}).setLayout({
  name: "specularLobeTanHalfAngle",
  type: "float",
  inputs: [
    { name: "roughness", type: "float" },
    { name: "percent", type: "float" }
  ]
});
const EXP_WEIGHT_SCALE = 4;
const NORMAL_ENCODING_ERROR = 1.5 / 255;
const lobeNormalFalloff = Fn(([roughness, aggressivity, invNormalPhi]) => {
  const percent = mix(invNormalPhi.pow2(), float(0), aggressivity.sqrt()).clamp(0.1, 0.99);
  const tanHalfAngle = specularLobeTanHalfAngle(roughness, percent);
  const lobeHalfAngle = max(atan(tanHalfAngle), float(NORMAL_ENCODING_ERROR));
  const invHalfAngle = float(1).div(lobeHalfAngle);
  return invHalfAngle.mul(invHalfAngle).mul(2 * EXP_WEIGHT_SCALE);
}).setLayout({
  name: "lobeNormalFalloff",
  type: "float",
  inputs: [
    { name: "roughness", type: "float" },
    { name: "aggressivity", type: "float" },
    { name: "invNormalPhi", type: "float" }
  ]
});
const lobeNormalWeight = Fn(([viewNormal, nNormalV, lobeFalloff]) => {
  const cosA = dot(viewNormal, nNormalV);
  return exp(cosA.sub(1).mul(lobeFalloff));
}).setLayout({
  name: "lobeNormalWeight",
  type: "float",
  inputs: [
    { name: "viewNormal", type: "vec3" },
    { name: "nNormalV", type: "vec3" },
    { name: "lobeFalloff", type: "float" }
  ]
});
const planeDistance = Fn(([position, nPosition, normal]) => {
  return abs(dot(position.sub(nPosition), normal));
}).setLayout({
  name: "planeDistance",
  type: "float",
  inputs: [
    { name: "position", type: "vec3" },
    { name: "nPosition", type: "vec3" },
    { name: "normal", type: "vec3" }
  ]
});
const karisTemporalBlend = Fn(([denoisedRgb, denoisedRaw, a, flickerSuppression, adaptiveTrust, nbhdMeanLuma, nbhdStddevLuma]) => {
  const localCoV = nbhdStddevLuma.div(nbhdMeanLuma.max(1e-4));
  const trustSuppress = localCoV.mul(adaptiveTrust).mul(a.oneMinus()).clamp(0, 0.9);
  const aTrust = a.mul(trustSuppress.oneMinus());
  const noisy = smoothstep(FLICKER_COV_GATE_MIN, FLICKER_COV_GATE_MAX, localCoV);
  const effFlicker = flickerSuppression.mul(mix(adaptiveTrust.oneMinus(), float(1), noisy));
  const wHist = float(1).sub(aTrust).div(luminance(denoisedRgb).mul(effFlicker).mul(10).add(1));
  const wRaw = aTrust.div(luminance(denoisedRaw).mul(effFlicker).mul(10).add(1));
  return denoisedRgb.mul(wHist).add(denoisedRaw.mul(wRaw)).div(wHist.add(wRaw).max(EPSILON));
}).setLayout({
  name: "karisTemporalBlend",
  type: "vec3",
  inputs: [
    { name: "denoisedRgb", type: "vec3" },
    { name: "denoisedRaw", type: "vec3" },
    { name: "a", type: "float" },
    { name: "flickerSuppression", type: "float" },
    { name: "adaptiveTrust", type: "float" },
    { name: "nbhdMeanLuma", type: "float" },
    { name: "nbhdStddevLuma", type: "float" }
  ]
});
const toTextureNode = (value) => {
  var _a;
  if (value === null) return null;
  if (value.isTexture === true) return texture(value);
  return convertToTexture(((_a = value.getTextureNode) == null ? void 0 : _a.call(value)) ?? value);
};
class RecurrentDenoiseNode extends TempNode {
  static get type() {
    return "RecurrentDenoiseNode";
  }
  /**
   * @param {TextureNode} inputTexture - Temporally filtered input to denoise (e.g. TRAA output).
   * @param {Camera} camera
   * @param {RecurrentDenoiseNodeOptions} [options={}]
   */
  constructor(inputTexture, camera, options = {}) {
    super("vec4");
    const {
      depth = null,
      normal = null,
      metalRoughness = null,
      diffuse = null,
      raw = null,
      mode = "diffuse",
      accumulate = true
    } = options;
    this.isRecurrentDenoiseNode = true;
    this.camera = camera;
    this.mode = mode;
    this.accumulate = accumulate;
    this.textureNode = inputTexture;
    this.depthNode = depth !== null ? nodeObject(depth) : null;
    this.normalNode = normal !== null ? nodeObject(normal) : null;
    this.rawNode = toTextureNode(raw);
    this.roughnessMetalnessNode = metalRoughness !== null ? nodeObject(metalRoughness) : null;
    this.diffuseNode = diffuse !== null ? nodeObject(diffuse) : null;
    this._noiseIndex = uniform(0);
    this.lumaPhi = uniform(5);
    this.depthPhi = uniform(5);
    this.normalPhi = uniform(5);
    this.radius = uniform(5);
    this.alphaPhi = uniform(1);
    this.roughnessPhi = uniform(100);
    this.diffusePhi = uniform(100);
    this.adapt = uniform(0.5);
    this.smoothDisocclusions = uniform(true, "bool");
    this.strength = uniform(0.25);
    this.maxFrames = uniform(32);
    this.alphaSource = "raylength";
    this.flickerSuppression = uniform(1);
    this.adaptiveTrust = uniform(0);
    this.updateBeforeType = NodeUpdateType.FRAME;
    this._resolution = uniform(new Vector2());
    this._fovY = uniform(MathUtils.degToRad(camera.fov));
    this._cameraProjectionMatrixInverse = uniform(new Matrix4().copy(camera.projectionMatrixInverse));
    this._cameraProjectionMatrix = uniform(new Matrix4().copy(camera.projectionMatrix));
    this._viewMatrix = uniform(new Matrix4().copy(camera.matrixWorldInverse));
    this._renderTarget = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
    this._renderTarget.texture.name = "RecurrentDenoiseNode.output";
    this._material = new NodeMaterial();
    this._material.name = "RecurrentDenoise";
    this._textureNode = passTexture(this, this._renderTarget.texture);
  }
  setSize(width, height) {
    if (width === null || height === null) return;
    this._renderTarget.setSize(width, height);
    this._resolution.value.set(width, height);
  }
  getTextureNode() {
    return this._textureNode;
  }
  /**
   * Returns the internal output render target (e.g. for temporal reprojection/SSGI temporal feedback loops).
   *
   * @returns {RenderTarget}
   */
  getRenderTarget() {
    return this._renderTarget;
  }
  updateBefore(frame) {
    const { renderer } = frame;
    const drawingBufferSize = renderer.getDrawingBufferSize(_size);
    const width = drawingBufferSize.width;
    const height = drawingBufferSize.height;
    const needsRestart = this._renderTarget.width !== width || this._renderTarget.height !== height;
    this.setSize(width, height);
    this._cameraProjectionMatrix.value.copy(this.camera.projectionMatrix);
    this._cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse);
    this._viewMatrix.value.copy(this.camera.matrixWorldInverse);
    if (this.camera.isPerspectiveCamera) {
      this._fovY.value = MathUtils.degToRad(this.camera.fov);
    }
    if (frame.frameId !== void 0) this._noiseIndex.value = frame.frameId;
    if (this.textureNode.isPassTextureNode === true) frame.updateBeforeNode(this.textureNode.passNode);
    _rendererState = RendererUtils.resetRendererState(renderer, _rendererState);
    if (needsRestart === true) {
      renderer.initRenderTarget(this._renderTarget);
      renderer.setRenderTarget(this._renderTarget);
      renderer.clear();
      renderer.setRenderTarget(null);
    }
    renderer.setRenderTarget(this._renderTarget);
    _quadMesh.material = this._material;
    _quadMesh.name = "RecurrentDenoise";
    _quadMesh.render(renderer);
    renderer.setRenderTarget(null);
    RendererUtils.restoreRendererState(renderer, _rendererState);
  }
  setup(builder) {
    const sampleAnalyticNoise = bindAnalyticNoise(this._resolution, NOISE_ROTATION_SEED);
    const noiseRotationMatrix = Fn(([r]) => {
      const angle = r.mul(2).mul(PI);
      return mat2(cos(angle), sin(angle).negate(), sin(angle), cos(angle));
    });
    const sampleTexture = (uvCoord) => texture(this.textureNode, uvCoord).max(0);
    const sampleRaw = (uvCoord) => {
      var _a, _b;
      return ((_b = (_a = this.rawNode) == null ? void 0 : _a.sample(uvCoord)) == null ? void 0 : _b.max(0)) ?? vec3(0).max(0);
    };
    const sampleDepth = (uvCoord) => {
      var _a, _b;
      return ((_b = (_a = this.depthNode) == null ? void 0 : _a.sample(uvCoord)) == null ? void 0 : _b.x) ?? float(0.5);
    };
    const sampleNormal = (uvCoord) => {
      var _a, _b;
      return unpackRGBToNormal(((_b = (_a = this.normalNode) == null ? void 0 : _a.sample(uvCoord)) == null ? void 0 : _b.rgb) ?? vec3(0, 0, 1));
    };
    const sampleRoughnessMetalness = (uvCoord) => {
      var _a, _b;
      return ((_b = (_a = this.roughnessMetalnessNode) == null ? void 0 : _a.sample(uvCoord)) == null ? void 0 : _b.rg) ?? vec2(0, 1);
    };
    const sampleDiffuse = (uvCoord) => {
      var _a, _b;
      return ((_b = (_a = this.diffuseNode) == null ? void 0 : _a.sample(uvCoord)) == null ? void 0 : _b.rgb) ?? vec3(0);
    };
    const getNeighborhoodStats = Fn(([uvCoord, centerSample]) => {
      const rlSum = float(0).toVar();
      const rlSumW = float(0).toVar();
      const meanLuma = float(0).toVar();
      const m2Luma = float(0).toVar();
      const lumaCount = float(0).toVar();
      const hasEnvRay = bool(false).toVar();
      const accumulate = (dx, dy, sample) => {
        const neighbor = sample !== void 0 ? sample : texture(this.rawNode, uvCoord.add(vec2(dx, dy).div(this._resolution))).max(0).toConst();
        if (this.alphaSource === "raylength") {
          const sampleRl = neighbor.a.toVar();
          If(sampleRl.greaterThan(ENV_RAY_LENGTH_THRESHOLD), () => {
            sampleRl.assign(0.25);
            hasEnvRay.assign(true);
          });
          const w = float(1).div(sampleRl.add(1e-3));
          rlSum.addAssign(sampleRl.mul(w));
          rlSumW.addAssign(w);
        }
        If(this.adaptiveTrust.greaterThan(0), () => {
          const nLuma = luminance(neighbor.rgb);
          lumaCount.addAssign(1);
          const delta = nLuma.sub(meanLuma).toConst();
          meanLuma.addAssign(delta.div(lumaCount));
          m2Luma.addAssign(delta.mul(nLuma.sub(meanLuma)));
        });
      };
      accumulate(0, 0, centerSample);
      accumulate(-1, 0);
      accumulate(1, 0);
      accumulate(0, -1);
      accumulate(0, 1);
      const avgRayLength = this.alphaSource === "raylength" ? rlSum.div(rlSumW) : float(1);
      const stddevLuma = sqrt(m2Luma.div(lumaCount.max(1)));
      return vec4(avgRayLength, meanLuma, stddevLuma, hasEnvRay.toFloat());
    }).setLayout({
      name: "getNeighborhoodStats",
      type: "vec4",
      inputs: [
        { name: "uvCoord", type: "vec2" },
        { name: "centerSample", type: "vec4" }
      ]
    });
    const denoiseFn = Fn(([uvCoord]) => {
      const result = property("vec4");
      const depth = sampleDepth(uvCoord).toConst();
      const runDenoise = () => {
        const viewNormal = sampleNormal(uvCoord).toConst();
        const worldNormal = viewNormal.transformDirection(this._viewMatrix).toConst();
        const texel = sampleTexture(uvCoord).max(0).toConst();
        const viewPosition = getViewPosition(uvCoord, depth, this._cameraProjectionMatrixInverse).toConst();
        const roughnessMetalness = sampleRoughnessMetalness(uvCoord).toConst();
        const roughness = roughnessMetalness.g;
        const metalness = roughnessMetalness.r;
        const noiseTexel = sampleAnalyticNoise(uvCoord, this._noiseIndex);
        const rotationMatrix = noiseRotationMatrix(noiseTexel.r);
        const frameNum = float(1).div(texel.a);
        const varianceFactor = getTemporalVarianceFactor(frameNum, this.strength.oneMinus());
        const aggressivity = varianceFactor.oneMinus();
        const raw = sampleRaw(uvCoord).toConst();
        const viewZ = abs(viewPosition.z);
        const rl = float(1).toVar();
        const nbhdMeanLuma = float(0).toVar();
        const nbhdStddevLuma = float(0).toVar();
        const hasEnvRay = bool(false).toVar();
        if (this.alphaSource === "raylength") {
          const stats = getNeighborhoodStats(uvCoord, raw);
          rl.assign(stats.x);
          nbhdMeanLuma.assign(stats.y);
          nbhdStddevLuma.assign(stats.z);
          hasEnvRay.assign(stats.w.greaterThan(0.5));
        } else {
          If(this.adaptiveTrust.greaterThan(0), () => {
            const stats = getNeighborhoodStats(uvCoord, raw);
            nbhdMeanLuma.assign(stats.y);
            nbhdStddevLuma.assign(stats.z);
          });
        }
        const tanHalfFovY = this.alphaSource === "raylength" ? tan(this._fovY.mul(0.5)).toConst() : null;
        const hitDistFactor = this.alphaSource === "raylength" ? computeHitDistFactor(rl, viewZ, tanHalfFovY).toConst() : float(1);
        const denoised = texel.rgb.toVar();
        const totalWeight = float(1).toVar();
        const denoisedFrame = frameNum.toVar();
        const totalFrameWeight = float(1).toVar();
        const denoisedRaw = raw.rgb.toVar();
        const totalWeightRaw = float(1).toVar();
        If(raw.rgb.length().lessThan(1e-4), () => {
          denoisedRaw.assign(vec3(0));
          totalWeightRaw.assign(0);
        });
        const avgAo = this.alphaSource === "ao" ? raw.a.toConst() : float(1);
        const mappedAvgAo = this.alphaSource === "ao" ? mapAo(avgAo) : float(0);
        const worldRadius = this.radius.mul(WORLD_RADIUS_SCALE).toVar();
        if (this.mode === "specular") {
          worldRadius.mulAssign(rl.mul(viewPosition.z.abs()));
          worldRadius.mulAssign(roughness.sqrt().max(0.01));
        } else {
          worldRadius.mulAssign(avgAo.pow(2).mul(viewPosition.z.abs()));
        }
        worldRadius.mulAssign(mix(1, AGGRESSIVITY_RADIUS_MIN, aggressivity));
        const T = vec3(0).toVar();
        const B = vec3(0).toVar();
        if (this.mode === "specular") {
          const V = normalize(viewPosition).negate();
          const D = getSpecularDominantDirection(viewNormal, V, roughness);
          const R = reflect(D.negate(), viewNormal);
          const Tv = normalize(cross(viewNormal, R));
          const Bv = cross(R, Tv);
          const viewAngle = abs(viewNormal.z).acos().div(float(Math.PI * 0.5)).clamp(0, 1);
          const skewFactor = mix(1, roughness, viewAngle);
          T.assign(Tv.mul(skewFactor));
          B.assign(Bv);
        } else {
          const up = vec3(0, 0, 1);
          const Tv = cross(up, viewNormal).normalize().toVar();
          If(Tv.length().lessThan(EPSILON), () => {
            Tv.assign(cross(vec3(0, 1, 0), viewNormal).normalize());
          });
          T.assign(Tv);
          B.assign(cross(viewNormal, Tv).normalize());
        }
        T.mulAssign(worldRadius);
        B.mulAssign(worldRadius);
        const centerDiffuse = sampleDiffuse(uvCoord).toConst();
        const radiusShrink = float(1).toVar();
        const polarBias = vec2(0).toVar();
        const depthWeightScale = this.depthPhi.mul(500).mul(viewNormal.z.abs()).div(viewPosition.z.abs());
        const lobeFalloff = lobeNormalFalloff(roughness, aggressivity, this.normalPhi.oneMinus()).toConst();
        Loop({ start: int(0), end: int(KERNEL_SAMPLES), type: "int", condition: "<", name: "i" }, ({ i }) => {
          const baseOffset = vogelDisk(float(i), 1).toVar();
          const sampleDir = baseOffset.normalize().toConst();
          const skewedDir = mix(sampleDir, polarBias.max(EPSILON).normalize(), this.adapt.mul(aggressivity).mul(polarBias.dot(polarBias).greaterThan(1e-3).select(1, 0)));
          const offset = rotationMatrix.mul(skewedDir.mul(baseOffset.length().mul(radiusShrink))).toVar();
          const sampleViewPos = viewPosition.add(B.mul(offset.x).add(T.mul(offset.y)));
          const sampleUv = getScreenPosition(sampleViewPos, this._cameraProjectionMatrix).toVar();
          sampleUv.assign(sampleUv.abs().oneMinus().abs().oneMinus().clamp());
          const neighborColor = sampleTexture(sampleUv).max(0).toConst();
          const rawNeighborColor = sampleRaw(sampleUv).max(0).toVar();
          const nDepth = sampleDepth(sampleUv);
          const nViewPosition = getViewPosition(sampleUv, nDepth, this._cameraProjectionMatrixInverse).toConst();
          const nViewZ = abs(nViewPosition.z).toConst();
          const kernelDiff = float(0).toVar();
          kernelDiff.addAssign(luminance(rawNeighborColor.rgb).sub(luminance(raw.rgb)).abs().mul(this.lumaPhi).mul(10));
          if (this.diffuseNode !== null) {
            kernelDiff.addAssign(diffuseColorDistance(centerDiffuse, sampleDiffuse(sampleUv), float(0)).mul(this.diffusePhi).mul(metalness));
          }
          if (this.alphaSource === "ao") {
            const neighborMappedAo = mapAo(rawNeighborColor.a);
            const aoW = mappedAvgAo.div(mappedAvgAo.add(neighborMappedAo).add(AO_EDGE_STOPPING_BIAS)).mul(this.alphaPhi).mul(aggressivity);
            kernelDiff.addAssign(aoW);
          } else if (this.alphaSource === "raylength") {
            const neighborHitDistFactor = computeHitDistFactor(rawNeighborColor.a, nViewZ, tanHalfFovY);
            const hdfDiff = hitDistFactor.sub(neighborHitDistFactor).abs();
            const rayLengthFactor = hdfDiff.mul(this.alphaPhi).div(viewPosition.z.abs());
            kernelDiff.addAssign(rawNeighborColor.a.greaterThan(ENV_RAY_LENGTH_THRESHOLD).and(hasEnvRay).select(1, rayLengthFactor));
          }
          if (this.mode === "specular") kernelDiff.addAssign(abs(roughness.sub(sampleRoughnessMetalness(sampleUv).g)).mul(this.roughnessPhi));
          const nViewNormal = sampleNormal(sampleUv);
          const nWorldNormal = nViewNormal.transformDirection(this._viewMatrix);
          const distToPlane = planeDistance(viewPosition, nViewPosition, viewNormal);
          const depthDiff = distToPlane.mul(depthWeightScale);
          const normalW = lobeNormalWeight(worldNormal, nWorldNormal, lobeFalloff);
          const w = exp(kernelDiff.mul(aggressivity).add(depthDiff).negate()).mul(normalW).toVar();
          radiusShrink.assign(mix(radiusShrink, w, this.adapt));
          polarBias.assign(mix(polarBias, sampleDir.mul(w.sub(0.5)), 0.5));
          w.mulAssign(mix(float(1).div(luminance(rawNeighborColor.rgb).pow(2).add(0.01)), 1, frameNum.div(5).min(1)));
          denoisedRaw.addAssign(rawNeighborColor.rgb.mul(w));
          totalWeightRaw.addAssign(w);
          denoised.addAssign(neighborColor.rgb.mul(w));
          totalWeight.addAssign(w);
          If(this.smoothDisocclusions, () => {
            const neighborAWeight = neighborColor.a.greaterThan(texel.a).select(w.mul(0.33), 0);
            denoisedFrame.addAssign(float(1).div(neighborColor.a).mul(neighborAWeight));
            totalFrameWeight.addAssign(neighborAWeight);
          });
        });
        denoised.divAssign(totalWeight.max(EPSILON));
        denoised.assign(denoised.max(EPSILON));
        denoisedRaw.divAssign(totalWeightRaw.max(EPSILON));
        if (this.accumulate) {
          const computedFrame = denoisedFrame.div(totalFrameWeight.max(EPSILON));
          const a = float(1).div(computedFrame.max(EPSILON)).toConst();
          if (this.rawNode !== null) {
            const blended = karisTemporalBlend(
              denoised,
              denoisedRaw,
              a,
              this.flickerSuppression,
              this.adaptiveTrust,
              nbhdMeanLuma,
              nbhdStddevLuma
            );
            result.assign(vec4(blended, a));
          } else {
            const finalDenoised = mix(denoised, denoisedRaw, a);
            result.assign(vec4(finalDenoised, a));
          }
        } else {
          result.assign(vec4(denoised, texel.a));
        }
      };
      If(depth.greaterThanEqual(1), () => {
        Discard();
      }).Else(runDenoise);
      return result;
    });
    this._material.fragmentNode = denoiseFn(uv()).context(builder.getSharedContext());
    this._material.needsUpdate = true;
    return this._textureNode;
  }
  dispose() {
    this._renderTarget.dispose();
    this._material.dispose();
  }
}
export default RecurrentDenoiseNode;
export const recurrentDenoise = (inputTexture, camera, options = {}) => nodeObject(new RecurrentDenoiseNode(
  toTextureNode(inputTexture),
  camera,
  options
));
