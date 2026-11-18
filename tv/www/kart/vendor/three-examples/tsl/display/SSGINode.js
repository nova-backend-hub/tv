import { RenderTarget, Vector2, TempNode, QuadMesh, NodeMaterial, RendererUtils, MathUtils, RGBFormat, RedFormat, UnsignedInt101111Type, UnsignedByteType } from "three/webgpu";
import { clamp, normalize, reference, Fn, NodeUpdateType, uniform, vec4, passTexture, uv, logarithmicDepthToViewZ, viewZToPerspectiveDepth, getViewPosition, screenCoordinate, float, sub, fract, dot, vec2, rand, vec3, Loop, mul, PI, cos, sin, uint, cross, acos, sign, pow, luminance, If, max, abs, Break, sqrt, HALF_PI, div, ceil, shiftRight, convertToTexture, bool, getNormalFromDepth, countOneBits, interleavedGradientNoise, property, outputStruct } from "three/tsl";
const _quadMesh = /* @__PURE__ */ new QuadMesh();
const _size = /* @__PURE__ */ new Vector2();
const _temporalRotations = [60, 300, 180, 240, 120, 0];
const _spatialOffsets = [0, 0.5, 0.25, 0.75];
let _rendererState;
class SSGINode extends TempNode {
  static get type() {
    return "SSGINode";
  }
  /**
   * Constructs a new SSGI node.
   *
   * @param {TextureNode} beautyNode - A texture node that represents the beauty or scene pass.
   * @param {TextureNode} depthNode - A texture node that represents the scene's depth.
   * @param {TextureNode} normalNode - A texture node that represents the scene's normals.
   * @param {PerspectiveCamera} camera - The camera the scene is rendered with.
   */
  constructor(beautyNode, depthNode, normalNode, camera) {
    super("vec4");
    this.beautyNode = beautyNode;
    this.depthNode = depthNode;
    this.normalNode = normalNode;
    this.updateBeforeType = NodeUpdateType.FRAME;
    this.sliceCount = uniform(1, "uint");
    this.stepCount = uniform(12, "uint");
    this.aoIntensity = uniform(1, "float");
    this.giIntensity = uniform(10, "float");
    this.radius = uniform(12, "float");
    this.useScreenSpaceSampling = uniform(true, "bool");
    this.expFactor = uniform(2, "float");
    this.thickness = uniform(1, "float");
    this.useLinearThickness = uniform(false, "bool");
    this.backfaceLighting = uniform(0, "float");
    this.useTemporalFiltering = true;
    this._resolution = uniform(new Vector2());
    this._halfProjScale = uniform(1);
    this._temporalDirection = uniform(0);
    this._temporalOffset = uniform(0);
    this._cameraProjectionMatrix = uniform(camera.projectionMatrix);
    this._cameraProjectionMatrixInverse = uniform(camera.projectionMatrixInverse);
    this._cameraNear = reference("near", "float", camera);
    this._cameraFar = reference("far", "float", camera);
    this._camera = camera;
    this._ssgiRenderTarget = new RenderTarget(1, 1, { depthBuffer: false, count: 2 });
    const aoTexture = this._ssgiRenderTarget.textures[0];
    aoTexture.name = "SSGI.AO";
    aoTexture.type = UnsignedByteType;
    aoTexture.format = RedFormat;
    const giTexture = this._ssgiRenderTarget.textures[1];
    giTexture.name = "SSGI.GI";
    giTexture.type = UnsignedInt101111Type;
    giTexture.format = RGBFormat;
    this._material = new NodeMaterial();
    this._material.name = "SSGI";
    this._aoNode = passTexture(this, this._ssgiRenderTarget.textures[0]);
    this._giNode = passTexture(this, this._ssgiRenderTarget.textures[1]);
  }
  /**
   * Returns the AO result of the effect as a texture node.
   *
   * @return {PassTextureNode} A texture node that represents the AO result of the effect.
   */
  getAONode() {
    return this._aoNode;
  }
  /**
   * Returns the GI result of the effect as a texture node.
   *
   * @return {PassTextureNode} A texture node that represents the GI result of the effect.
   */
  getGINode() {
    return this._giNode;
  }
  /**
   * Sets the size of the effect.
   *
   * @param {number} width - The width of the effect.
   * @param {number} height - The height of the effect.
   */
  setSize(width, height) {
    this._resolution.value.set(width, height);
    this._ssgiRenderTarget.setSize(width, height);
    this._halfProjScale.value = height / (Math.tan(this._camera.fov * MathUtils.DEG2RAD * 0.5) * 2) * 0.5;
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
      this._temporalDirection.value = _temporalRotations[frameId % 6] / 360;
      this._temporalOffset.value = _spatialOffsets[frameId % 4];
    } else {
      this._temporalDirection.value = 1;
      this._temporalOffset.value = 1;
    }
    _quadMesh.material = this._material;
    _quadMesh.name = "SSGI";
    renderer.setClearColor(16777215, 1);
    renderer.setRenderTarget(this._ssgiRenderTarget);
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
    const renderer = builder.renderer;
    if (renderer.backend.isWebGPUBackend === true && renderer.hasFeature("rg11b10ufloat-renderable") === false) {
      console.error('THREE.SSGINode: The device does not support the "rg11b10ufloat-renderable" feature which is required for SSGI.');
    }
    const uvNode = uv();
    const MAX_RAY = uint(32);
    const globalOccludedBitfield = uint(0);
    const sampleDepth = (uv2) => {
      const depth = this.depthNode.sample(uv2).r;
      if (builder.renderer.logarithmicDepthBuffer === true) {
        const viewZ = logarithmicDepthToViewZ(depth, this._cameraNear, this._cameraFar);
        return viewZToPerspectiveDepth(viewZ, this._cameraNear, this._cameraFar);
      }
      return depth;
    };
    const sampleNormal = (uv2) => this.normalNode !== null ? this.normalNode.sample(uv2).rgb.normalize() : getNormalFromDepth(uv2, this.depthNode.value, this._cameraProjectionMatrixInverse);
    const sampleBeauty = (uv2) => this.beautyNode.sample(uv2);
    const spatialOffsets = Fn(([position]) => {
      return float(0.25).mul(sub(position.y, position.x).bitAnd(3));
    }).setLayout({
      name: "spatialOffsets",
      type: "float",
      inputs: [
        { name: "position", type: "vec2" }
      ]
    });
    const GTAOFastAcos = Fn(([value]) => {
      const outVal = abs(value).mul(float(-0.156583)).add(HALF_PI);
      outVal.mulAssign(sqrt(abs(value).oneMinus()));
      const x = value.x.greaterThanEqual(0).select(outVal.x, PI.sub(outVal.x));
      const y = value.y.greaterThanEqual(0).select(outVal.y, PI.sub(outVal.y));
      return vec2(x, y);
    }).setLayout({
      name: "GTAOFastAcos",
      type: "vec2",
      inputs: [
        { name: "value", type: "vec2" }
      ]
    });
    const horizonSampling = Fn(([directionIsRight, stepRadius, radiusVS, viewPosition, slideDirTexelSize, initialRayStep, uvNode2, viewDir, viewNormal, n]) => {
      const STEP_COUNT = this.stepCount.toConst();
      const EXP_FACTOR = this.expFactor.toConst();
      const THICKNESS = this.thickness.toConst();
      const BACKFACE_LIGHTING = this.backfaceLighting.toConst();
      const uvDirection = directionIsRight.select(vec2(1, -1), vec2(-1, 1));
      const samplingDirection = directionIsRight.select(1, -1);
      const color = vec3(0);
      Loop({ start: uint(0), end: STEP_COUNT, type: "uint", condition: "<" }, ({ i }) => {
        const offset = pow(abs(mul(stepRadius, float(i).add(initialRayStep)).div(radiusVS)), EXP_FACTOR).mul(radiusVS).toConst();
        const uvOffset = slideDirTexelSize.mul(max(offset, float(i).add(1))).toConst();
        const sampleUV = uvNode2.add(uvOffset.mul(uvDirection)).toConst();
        If(sampleUV.x.lessThanEqual(0).or(sampleUV.y.lessThanEqual(0)).or(sampleUV.x.greaterThanEqual(1)).or(sampleUV.y.greaterThanEqual(1)), () => {
          Break();
        });
        const sampleViewPosition = getViewPosition(sampleUV, sampleDepth(sampleUV), this._cameraProjectionMatrixInverse).toConst();
        const pixelToSample = sampleViewPosition.sub(viewPosition).normalize().toConst();
        const linearThicknessMultiplier = this.useLinearThickness.select(sampleViewPosition.z.negate().div(this._cameraFar).clamp().mul(100), float(1));
        const pixelToSampleBackface = normalize(sampleViewPosition.sub(linearThicknessMultiplier.mul(viewDir).mul(THICKNESS)).sub(viewPosition));
        let frontBackHorizon = vec2(dot(pixelToSample, viewDir), dot(pixelToSampleBackface, viewDir));
        frontBackHorizon = GTAOFastAcos(clamp(frontBackHorizon, -1, 1));
        frontBackHorizon = clamp(div(mul(samplingDirection, frontBackHorizon.negate()).sub(n.sub(HALF_PI)), PI));
        frontBackHorizon = directionIsRight.select(frontBackHorizon.yx, frontBackHorizon.xy);
        const minHorizon = frontBackHorizon.x.toConst();
        const maxHorizon = frontBackHorizon.y.toConst();
        const startHorizonInt = uint(frontBackHorizon.mul(float(MAX_RAY))).toConst();
        const angleHorizonInt = uint(ceil(maxHorizon.sub(minHorizon).mul(float(MAX_RAY)))).toConst();
        const angleHorizonBitfield = angleHorizonInt.greaterThan(uint(0)).select(uint(shiftRight(uint(4294967295), uint(32).sub(MAX_RAY).add(MAX_RAY.sub(angleHorizonInt)))), uint(0)).toConst();
        let currentOccludedBitfield = angleHorizonBitfield.shiftLeft(startHorizonInt);
        currentOccludedBitfield = currentOccludedBitfield.bitAnd(globalOccludedBitfield.bitNot());
        globalOccludedBitfield.assign(globalOccludedBitfield.bitOr(currentOccludedBitfield));
        const numOccludedZones = countOneBits(currentOccludedBitfield);
        If(numOccludedZones.greaterThan(0), () => {
          const lightColor = sampleBeauty(sampleUV);
          If(luminance(lightColor).greaterThan(1e-3), () => {
            const lightDirectionVS = normalize(pixelToSample);
            const normalDotLightDirection = clamp(dot(viewNormal, lightDirectionVS));
            If(normalDotLightDirection.greaterThan(1e-3), () => {
              const lightNormalVS = sampleNormal(sampleUV);
              let lightNormalDotLightDirection = dot(lightNormalVS, lightDirectionVS.negate());
              const d = sign(lightNormalDotLightDirection).lessThan(0).select(abs(lightNormalDotLightDirection).mul(BACKFACE_LIGHTING), abs(lightNormalDotLightDirection));
              lightNormalDotLightDirection = BACKFACE_LIGHTING.greaterThan(0).and(dot(lightNormalVS, viewDir).greaterThan(0)).select(d, clamp(lightNormalDotLightDirection));
              color.rgb.addAssign(float(numOccludedZones).div(float(MAX_RAY)).mul(lightColor).mul(normalDotLightDirection).mul(lightNormalDotLightDirection));
            });
          });
        });
      });
      return color;
    });
    const aoField = property("float");
    const giField = property("vec3");
    const outputNode = outputStruct(aoField, giField);
    const gi = Fn(() => {
      const depth = sampleDepth(uvNode).toVar();
      depth.greaterThanEqual(1).discard();
      const viewPosition = getViewPosition(uvNode, depth, this._cameraProjectionMatrixInverse).toVar();
      const viewNormal = sampleNormal(uvNode).toVar();
      const viewDir = normalize(viewPosition.xyz.negate()).toVar();
      const noiseOffset = spatialOffsets(screenCoordinate);
      const noiseDirection = interleavedGradientNoise(screenCoordinate);
      const noiseJitterIdx = this._temporalDirection.mul(0.02);
      const initialRayStep = fract(noiseOffset.add(this._temporalOffset)).add(rand(uvNode.add(noiseJitterIdx).mul(2).sub(1)));
      const ao = float(0);
      const color = vec3(0);
      const ROTATION_COUNT = this.sliceCount.toConst();
      const STEP_COUNT = this.stepCount.toConst();
      const AO_INTENSITY = this.aoIntensity.toConst();
      const GI_INTENSITY = this.giIntensity.toConst();
      const RADIUS = this.radius.toConst();
      const stepRadius = float(0).toVar();
      If(this.useScreenSpaceSampling, () => {
        stepRadius.assign(RADIUS.mul(this._resolution.x.div(2)).div(float(16)));
      }).Else(() => {
        stepRadius.assign(max(RADIUS.mul(this._halfProjScale).div(viewPosition.z.negate()), float(STEP_COUNT)));
      });
      stepRadius.divAssign(float(STEP_COUNT).add(1));
      const radiusVS = max(1, float(STEP_COUNT.sub(1))).mul(stepRadius).toConst();
      Loop({ start: uint(0), end: ROTATION_COUNT, type: "uint", condition: "<" }, ({ i }) => {
        const rotationAngle = mul(float(i).add(noiseDirection).add(this._temporalDirection), PI.div(float(ROTATION_COUNT))).toConst();
        const sliceDir = vec3(vec2(cos(rotationAngle), sin(rotationAngle)), 0).toConst();
        const slideDirTexelSize = sliceDir.xy.mul(float(1).div(this._resolution)).toConst();
        const planeNormal = normalize(cross(sliceDir, viewDir)).toConst();
        const tangent = cross(viewDir, planeNormal).toConst();
        const projectedNormal = viewNormal.sub(planeNormal.mul(dot(viewNormal, planeNormal))).toConst();
        const projectedNormalNormalized = normalize(projectedNormal).toConst();
        const cos_n = clamp(dot(projectedNormalNormalized, viewDir), -1, 1).toConst();
        const n = sign(dot(projectedNormal, tangent)).negate().mul(acos(cos_n)).toConst();
        globalOccludedBitfield.assign(0);
        color.addAssign(horizonSampling(bool(true), stepRadius, radiusVS, viewPosition, slideDirTexelSize, initialRayStep, uvNode, viewDir, viewNormal, n));
        color.addAssign(horizonSampling(bool(false), stepRadius, radiusVS, viewPosition, slideDirTexelSize, initialRayStep, uvNode, viewDir, viewNormal, n));
        ao.addAssign(float(countOneBits(globalOccludedBitfield)).div(float(MAX_RAY)));
      });
      ao.divAssign(float(ROTATION_COUNT));
      ao.assign(pow(ao.clamp().oneMinus(), AO_INTENSITY).clamp());
      color.divAssign(float(ROTATION_COUNT));
      color.mulAssign(GI_INTENSITY);
      const maxLuminance = float(7).toConst();
      const currentLuminance = luminance(color);
      const scale = currentLuminance.greaterThan(maxLuminance).select(maxLuminance.div(currentLuminance), float(1));
      color.mulAssign(scale);
      aoField.assign(ao);
      giField.assign(color);
      return vec4(0);
    });
    this._material.colorNode = gi().context(builder.getSharedContext());
    this._material.outputNode = outputNode;
    this._material.needsUpdate = true;
    return this._aoNode;
  }
  /**
   * Frees internal resources. This method should be called
   * when the effect is no longer required.
   */
  dispose() {
    this._ssgiRenderTarget.dispose();
    this._material.dispose();
  }
}
export default SSGINode;
export const ssgi = (beautyNode, depthNode, normalNode, camera) => new SSGINode(convertToTexture(beautyNode), depthNode, normalNode, camera);
