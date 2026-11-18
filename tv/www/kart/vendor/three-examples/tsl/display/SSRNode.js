import { Break, Continue, Fn, If, Loop, abs, bool, cross, distance, div, dot, float, getScreenPosition, getViewPosition, int, logarithmicDepthToViewZ, luminance, max, min, mix, mul, nodeObject, normalize, orthographicDepthToViewZ, passTexture, perspectiveDepthToViewZ, reference, reflect, sub, texture, trunc, uniform, uv, vec2, vec3, vec4, viewZToPerspectiveDepth } from "three/tsl";
import { HalfFloatType, LinearFilter, LinearMipmapLinearFilter, Matrix4, NodeMaterial, NodeUpdateType, QuadMesh, RenderTarget, RendererUtils, TempNode, Vector2, Vector3 } from "three/webgpu";
import { bindAnalyticNoise } from "../utils/RNoise.js";
import { ENV_RAY_LENGTH, getSpecularDominantFactor, ggxReflectionSample } from "../utils/SpecularHelpers.js";
import { boxBlur } from "./boxBlur.js";
import ImportanceSampledEnvironment from "./ImportanceSampledEnvironment.js";
const _quadMesh = /* @__PURE__ */ new QuadMesh();
const _size = /* @__PURE__ */ new Vector2();
let _rendererState;
const MAX_STEPS = 64;
class SSRNode extends TempNode {
  static get type() {
    return "SSRNode";
  }
  /**
   * Constructs a new SSR node.
   *
   * @param {Node<vec4>} colorNode - The node that represents the beauty pass.
   * @param {Node<float>} depthNode - A node that represents the beauty pass's depth.
   * @param {Node<vec3>} normalNode - A node that represents the beauty pass's normals.
   * @param {SSRNodeOptions} [options] - Optional inputs for material and environment data.
   */
  constructor(colorNode, depthNode, normalNode, options = {}) {
    super("vec4");
    const {
      stochastic = false,
      metalnessNode = null,
      roughnessNode = null,
      reflectNonMetals = false,
      environmentNode = null,
      envImportanceSampling = false,
      diffuseNode = null,
      binaryRefine = false
    } = options;
    let camera = options.camera ?? null;
    this.stochastic = stochastic;
    this.envImportanceSampling = envImportanceSampling;
    this.colorNode = colorNode;
    this.diffuseNode = diffuseNode !== null ? nodeObject(diffuseNode) : null;
    this.depthNode = depthNode;
    this.normalNode = normalNode;
    this.metalnessNode = metalnessNode;
    this.roughnessNode = roughnessNode;
    this._reflectNonMetals = reflectNonMetals;
    this.resolutionScale = 1;
    this.updateBeforeType = NodeUpdateType.FRAME;
    this.maxDistance = uniform(1);
    this.thickness = uniform(0.1);
    this.intensity = uniform(1);
    this.screenEdgeFade = uniform(0.2);
    this._screenEdgeFadeBlack = false;
    this.maxLuminance = uniform(10);
    this.quality = uniform(0.5);
    this.mirrorBias = uniform(0.5);
    this._blurQuality = 2;
    this._binaryRefine = binaryRefine;
    this._stepExponent = 2;
    this.environmentNode = environmentNode;
    this.historyTexture = null;
    this.velocityTexture = null;
    if (camera === null) {
      if (this.colorNode.passNode && this.colorNode.passNode.isPassNode === true) {
        camera = this.colorNode.passNode.camera;
      } else {
        throw new Error("THREE.SSRNode: No camera found. ssr() requires a camera.");
      }
    }
    this.camera = camera;
    this._blurSpread = uniform(1);
    this._cameraProjectionMatrix = uniform(camera.projectionMatrix);
    this._cameraProjectionMatrixInverse = uniform(camera.projectionMatrixInverse);
    this._cameraNear = reference("near", "float", camera);
    this._cameraFar = reference("far", "float", camera);
    this._cameraWorldMatrix = uniform(new Matrix4().copy(camera.matrixWorld));
    this._cameraWorldPosition = uniform(new Vector3().copy(camera.position));
    this._cameraViewMatrix = uniform(new Matrix4().copy(camera.matrixWorld));
    this._cameraViewMatrixInverse = uniform(new Matrix4().copy(camera.matrixWorldInverse));
    this._resolution = uniform(new Vector2());
    this._noiseIndex = uniform(0);
    this._importanceEnvironment = null;
    this.environmentIntensity = uniform(Math.PI);
    this._ssrRenderTarget = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
    this._ssrRenderTarget.texture.name = "SSRNode.SSR";
    this._blurRenderTarget = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter });
    this._blurRenderTarget.texture.name = "SSRNode.Blur";
    this._blurRenderTarget.texture.mipmaps.push({}, {}, {}, {}, {});
    this._ssrMaterial = new NodeMaterial();
    this._ssrMaterial.name = "SSRNode.SSR";
    this._ssrFn = null;
    this._sharedContext = null;
    this._blurMaterial = new NodeMaterial();
    this._blurMaterial.name = "SSRNode.Blur";
    this._copyMaterial = new NodeMaterial();
    this._copyMaterial.name = "SSRNode.Copy";
    this._textureNode = passTexture(this, this._ssrRenderTarget.texture);
    let blurredTextureNode = null;
    if (this.stochastic === false && this.roughnessNode !== null) {
      const mips = this._blurRenderTarget.texture.mipmaps.length - 1;
      const r = this.roughnessNode;
      const lod = r.mul(r).mul(mips).clamp(0, mips);
      blurredTextureNode = passTexture(this, this._blurRenderTarget.texture).level(lod);
    }
    this._blurredTextureNode = blurredTextureNode;
    if (environmentNode !== null && environmentNode.isTexture === true) {
      this.setEnvMap(environmentNode);
    }
  }
  /**
   * Non-linear step distribution exponent (compile-time constant). See the backing
   * field for details. Assigning a new value recompiles the SSR material.
   *
   * @type {number}
   */
  get stepExponent() {
    return this._stepExponent;
  }
  set stepExponent(value) {
    if (value !== this._stepExponent) {
      this._stepExponent = value;
      this._buildSSRMaterial();
    }
  }
  /**
   * Blur kernel size (compile-time constant). Assigning a new value recompiles the
   * blur material.
   *
   * @type {number}
   */
  get blurQuality() {
    return this._blurQuality;
  }
  set blurQuality(value) {
    if (value !== this._blurQuality) {
      this._blurQuality = value;
      if (this.stochastic === false) this._buildBlurMaterial();
    }
  }
  /**
   * Builds (or rebuilds) the blur material's node graph, baking the current
   * {@link SSRNode#blurQuality} as the kernel size so the sample loop unrolls.
   *
   * @private
   */
  _buildBlurMaterial() {
    this._blurMaterial.fragmentNode = boxBlur(texture(this._ssrRenderTarget.texture), { size: this._blurQuality, separation: this._blurSpread });
    this._blurMaterial.needsUpdate = true;
  }
  /**
   * Whether SSR fades to black near screen borders (compile-time constant). Assigning
   * a new value recompiles the SSR material.
   *
   * @type {boolean}
   */
  get screenEdgeFadeBlack() {
    return this._screenEdgeFadeBlack;
  }
  set screenEdgeFadeBlack(value) {
    if (value !== this._screenEdgeFadeBlack) {
      this._screenEdgeFadeBlack = value;
      this._buildSSRMaterial();
    }
  }
  /**
   * Whether sub-step binary-search hit refinement is enabled (compile-time constant).
   * Assigning a new value rebuilds the SSR material.
   *
   * @type {boolean}
   */
  get binaryRefine() {
    return this._binaryRefine;
  }
  set binaryRefine(value) {
    if (value !== this._binaryRefine) {
      this._binaryRefine = value;
      this._buildSSRMaterial();
    }
  }
  /**
   * Whether dielectrics are reflected in the non-stochastic path (compile-time constant).
   * Assigning a new value rebuilds the SSR material.
   *
   * @type {boolean}
   */
  get reflectNonMetals() {
    return this._reflectNonMetals;
  }
  set reflectNonMetals(value) {
    if (value !== this._reflectNonMetals) {
      this._reflectNonMetals = value;
      this._buildSSRMaterial();
    }
  }
  /**
   * Rebuilds the SSR material's node graph by re-invoking the fragment `Fn`, which
   * re-bakes the compile-time constants ({@link SSRNode#binaryRefine},
   * {@link SSRNode#stepExponent}, {@link SSRNode#screenEdgeFadeBlack}) at their current
   * values. A no-op until {@link SSRNode#setup} has captured the `Fn`.
   *
   * @private
   */
  _buildSSRMaterial() {
    if (this._ssrFn === null) return;
    this._ssrMaterial.fragmentNode = this._ssrFn().context(this._sharedContext);
    this._ssrMaterial.needsUpdate = true;
  }
  /**
   * Returns the result of the effect as a texture node.
   *
   * @return {PassTextureNode} A texture node that represents the result of the effect.
   */
  getTextureNode() {
    return this.stochastic === false && this.roughnessNode !== null ? this._blurredTextureNode : this._textureNode;
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
    this._ssrRenderTarget.setSize(width, height);
    this._blurRenderTarget.setSize(width, height);
  }
  /**
   * Wires the feedback inputs for multi-bounce reflections: the previous frame's
   * denoised result (`history`) and the velocity buffer used to reproject it
   * (`velocity`). `history` accepts the producing node (e.g. a
   * {@link RecurrentDenoiseNode}) — its output render target is used — or a raw
   * texture. Pass `null` for both to disable multi-bounce.
   *
   * @param {Texture} history
   * @param {Node<vec2>} velocity
   */
  setHistory(history, velocity) {
    this.historyTexture = history && typeof history.getRenderTarget === "function" ? history.getRenderTarget().texture : history;
    this.velocityTexture = velocity;
  }
  /**
   * Sets the environment map for importance-sampled env lighting when
   * screen-space rays miss. Call this whenever the scene's env map changes.
   *
   * Uses {@link ImportanceSampledEnvironment} (CDF + MIS adapted from
   * [three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer)).
   *
   * @param {Texture|null} hdr - The equirectangular HDR environment map, or null to disable.
   * @see {@link https://github.com/gkjohnson/three-gpu-pathtracer}
   */
  setEnvMap(hdr) {
    if (hdr === null) {
      if (this._importanceEnvironment !== null) {
        this._importanceEnvironment.clear();
        this._importanceEnvironment = null;
      }
      this._buildSSRMaterial();
      return;
    }
    if (hdr.image === void 0 || hdr.image.data === void 0) {
      console.warn("SSRNode: `environmentNode` / `setEnvMap()` expects an equirectangular HDR texture with CPU-side image data (e.g. RGBELoader). PMREM cubemaps and `scene.environment` are not supported.");
      return;
    }
    if (this._importanceEnvironment === null) {
      this._importanceEnvironment = new ImportanceSampledEnvironment(this.envImportanceSampling);
    }
    this._importanceEnvironment.updateFrom(hdr);
    this._buildSSRMaterial();
  }
  /**
   * Intensity multiplier for the importance-sampled env contribution.
   * Only available after {@link setEnvMap} has been called.
   *
   * @type {?UniformNode<float>}
   */
  get envMapIntensity() {
    return this._importanceEnvironment !== null ? this._importanceEnvironment.intensity : null;
  }
  /**
   * This method is used to render the effect once per frame.
   *
   * @param {NodeFrame} frame - The current node frame.
   */
  updateBefore(frame) {
    const { renderer } = frame;
    this._cameraWorldMatrix.value.copy(this.camera.matrixWorld);
    this._cameraWorldPosition.value.copy(this.camera.position);
    _rendererState = RendererUtils.resetRendererState(renderer, _rendererState);
    const ssrRenderTarget = this._ssrRenderTarget;
    const blurRenderTarget = this._blurRenderTarget;
    const size = renderer.getDrawingBufferSize(_size);
    _quadMesh.material = this._ssrMaterial;
    this.setSize(size.width, size.height);
    this._noiseIndex.value = (this._noiseIndex.value + 1) % 2147483647;
    renderer.setMRT(null);
    renderer.setClearColor(0, 0);
    renderer.setRenderTarget(ssrRenderTarget);
    _quadMesh.name = "SSR [ Reflections ]";
    _quadMesh.render(renderer);
    if (this.stochastic === false && this.roughnessNode !== null) {
      for (let i = 0; i < blurRenderTarget.texture.mipmaps.length; i++) {
        _quadMesh.material = i === 0 ? this._copyMaterial : this._blurMaterial;
        this._blurSpread.value = i;
        renderer.setRenderTarget(blurRenderTarget, 0, i);
        _quadMesh.name = "SSR [ Blur Level " + i + " ]";
        _quadMesh.render(renderer);
      }
    }
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
    const pointToLineDistance = Fn(([point, linePointA, linePointB]) => {
      return cross(point.sub(linePointA), point.sub(linePointB)).length().div(linePointB.sub(linePointA).length());
    });
    const pointPlaneDistance = Fn(([point, planePoint, planeNormal]) => {
      const d = mul(planeNormal.x, planePoint.x).add(mul(planeNormal.y, planePoint.y)).add(mul(planeNormal.z, planePoint.z)).negate().toVar();
      const distance2 = mul(planeNormal.x, point.x).add(mul(planeNormal.y, point.y)).add(mul(planeNormal.z, point.z)).add(d);
      return distance2;
    });
    const getViewZ = Fn(([depth]) => {
      let viewZNode;
      if (this.camera.isPerspectiveCamera) {
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
    const sampleMarchNoise = this.stochastic === true ? bindAnalyticNoise(this._resolution, 47) : null;
    const computeScreenBorderFactor = Fn(([uvCoord, borderWidth]) => {
      const border = borderWidth.max(1e-4);
      const edgeDist = min(
        min(uvCoord.x, float(1).sub(uvCoord.x)),
        min(uvCoord.y, float(1).sub(uvCoord.y))
      );
      const t = edgeDist.smoothstep(0, border);
      return t.smoothstep(0, 1).pow(0.125);
    }).setLayout({
      name: "computeScreenBorderFactor",
      type: "float",
      inputs: [
        { name: "uvCoord", type: "vec2" },
        { name: "borderWidth", type: "float" }
      ]
    });
    const ssr2 = Fn(() => {
      const noise = this.stochastic === true ? sampleMarchNoise(uvNode, this._noiseIndex) : null;
      const uvPos = uvNode.toVar();
      const depth = sampleDepth(uvPos).toVar();
      depth.greaterThanEqual(1).discard();
      const viewPosition = getViewPosition(uvPos, depth, this._cameraProjectionMatrixInverse).toVar();
      const worldPosition = this._cameraWorldMatrix.mul(vec4(viewPosition, 1)).xyz.toVar();
      const viewNormal = this.normalNode.rgb.normalize().toVar();
      const viewIncidentDir = (this.camera.isPerspectiveCamera ? normalize(viewPosition) : vec3(0, 0, -1)).toVar();
      const metalness = float(this.metalnessNode);
      if (this.stochastic === false && this._reflectNonMetals === false) {
        metalness.lessThanEqual(0).discard();
      }
      const roughness = float(this.roughnessNode);
      const glossiness = min(roughness.div(0.25), 1).oneMinus();
      const surfaceBorderFactor = this.screenEdgeFadeBlack ? computeScreenBorderFactor(uvPos, this.screenEdgeFade) : null;
      const hitBorderWidth = this.screenEdgeFade.mul(glossiness);
      const V = viewIncidentDir.negate().normalize().toVar();
      let viewReflectDir, finalSampleWeight, specDominantFactor;
      const albedo = vec3(1).toVar();
      let sampleEnvReflection = null;
      if (this.stochastic === false) {
        viewReflectDir = reflect(viewIncidentDir, viewNormal).normalize().toVar();
        finalSampleWeight = vec3(metalness);
        specDominantFactor = float(1);
      } else {
        const Xi = noise.toVar();
        Xi.y.assign(mix(Xi.y, 0, this.mirrorBias.mul(Xi.w.sqrt())));
        albedo.assign(this.diffuseNode !== null ? this.diffuseNode.sample(uvPos).rgb : vec3(1));
        const ggxSample = ggxReflectionSample(viewNormal, V, roughness, metalness, albedo, Xi).toVar();
        If(ggxSample.get("reflectDir").dot(viewNormal).lessThan(0), () => {
          ggxSample.assign(ggxReflectionSample(viewNormal, V, roughness, metalness, albedo, Xi.add(Xi.mul(7)).fract()));
        });
        viewReflectDir = ggxSample.get("reflectDir").toVar();
        finalSampleWeight = ggxSample.get("sampleWeight").toVar();
        specDominantFactor = getSpecularDominantFactor(ggxSample.get("NdotV"), roughness).toVar();
        sampleEnvReflection = () => {
          const envColor = vec3(0).toVar();
          if (this.envImportanceSampling) {
            const Xi2 = bindAnalyticNoise(this._resolution, 59)(uvPos, this._noiseIndex);
            envColor.assign(this._importanceEnvironment.sampleEnvironmentMIS({
              cameraWorldMatrix: this._cameraWorldMatrix,
              viewReflectDir,
              N: viewNormal,
              V,
              alpha: ggxSample.get("alpha"),
              f0: ggxSample.get("f0"),
              Xi2
            }));
          } else {
            envColor.assign(this._importanceEnvironment.sampleEnvironmentBRDF({
              cameraWorldMatrix: this._cameraWorldMatrix,
              viewReflectDir,
              N: viewNormal,
              V,
              alpha: ggxSample.get("alpha"),
              f0: ggxSample.get("f0")
            }));
          }
          return envColor;
        };
      }
      const reprojectHitPointHistory = (uvHit, color) => {
        if (!(this.historyTexture && this.velocityTexture)) return color;
        const velocity = this.velocityTexture.sample(uvHit).xy;
        const historyUV = uvHit.sub(velocity);
        const historyBounce = texture(this.historyTexture, historyUV).toVar();
        const sampleDecay = historyBounce.a.oneMinus();
        return color.add(historyBounce.rgb.mul(sampleDecay));
      };
      const applyHitEdgeFade = (reflectColor, uvS, hitBorderWidth2) => {
        if (this.screenEdgeFadeBlack) {
          const hitBorderFactor = computeScreenBorderFactor(uvS, this.screenEdgeFade);
          reflectColor.rgb.mulAssign(hitBorderFactor);
        } else {
          const hitBorderFactor = computeScreenBorderFactor(uvS, hitBorderWidth2);
          If(hitBorderFactor.lessThan(1), () => {
            reflectColor.rgb.assign(mix(sampleEnvReflection().mul(this.environmentIntensity), reflectColor.rgb, hitBorderFactor));
          });
        }
      };
      const maxReflectRayLen = this.maxDistance.div(dot(viewIncidentDir.negate(), viewNormal)).toVar();
      const d1viewPosition = viewPosition.add(viewReflectDir.mul(maxReflectRayLen)).toVar();
      if (this.camera.isPerspectiveCamera) {
        If(d1viewPosition.z.greaterThan(this._cameraNear.negate()), () => {
          const t = sub(this._cameraNear.negate(), viewPosition.z).div(viewReflectDir.z);
          d1viewPosition.assign(viewPosition.add(viewReflectDir.mul(t)));
        });
      }
      const d0 = uvPos.mul(this._resolution).xy.toVar();
      const d1 = getScreenPosition(d1viewPosition, this._cameraProjectionMatrix).mul(this._resolution).toVar();
      const xLen = d1.x.sub(d0.x).toVar();
      const yLen = d1.y.sub(d0.y).toVar();
      const rayLen = max(xLen.abs(), yLen.abs()).max(1).toVar();
      const totalStep = int(this.stochastic === false ? trunc(max(abs(xLen), abs(yLen)).mul(this.quality.clamp())).max(int(1)).toConst() : this.quality.clamp().mul(MAX_STEPS).max(float(1))).toConst();
      const xSpan = xLen.div(totalStep).toVar();
      const ySpan = yLen.div(totalStep).toVar();
      const stepVec = vec2(xSpan, ySpan).toVar();
      const invResolution = vec2(float(1), float(1)).div(this._resolution).toVar();
      const uvPixelStepX = vec2(invResolution.x, float(0)).toVar();
      const output = vec4(0).toVar();
      const hit = float(0).toVar();
      const recipVPZ = float(1).div(viewPosition.z).toConst();
      const recipD1VPZ = float(1).div(d1viewPosition.z).toConst();
      const reflectRayZAt = this.camera.isPerspectiveCamera ? (sVal) => float(1).div(recipVPZ.add(sVal.mul(recipD1VPZ.sub(recipVPZ)))) : (sVal) => viewPosition.z.add(sVal.mul(d1viewPosition.z.sub(viewPosition.z)));
      const screenPosAt = (sVal) => d0.add(stepVec.mul(sVal.mul(totalStep)));
      const sampleFraction = this.stochastic === false ? (idx) => idx.div(totalStep) : (idx) => max(
        idx.add(noise.z.sub(0.5)).div(totalStep).pow(this.stepExponent),
        idx.div(rayLen)
      );
      const foundHit = bool(false).toVar();
      const hitSLo = float(0).toVar();
      const hitSHi = float(0).toVar();
      const hitUvS = vec2(0).toVar();
      const hitD = float(0).toVar();
      Loop({ start: int(1), end: totalStep }, ({ i }) => {
        const s = sampleFraction(float(i)).toVar();
        const xy = screenPosAt(s).toVar();
        If(xy.x.lessThan(0).or(xy.x.greaterThan(this._resolution.x)).or(xy.y.lessThan(0)).or(xy.y.greaterThan(this._resolution.y)), () => {
          Break();
        });
        const uvS = xy.mul(invResolution).toVar();
        const d = sampleDepth(uvS).toVar();
        const vZ = getViewZ(d).toVar();
        const viewReflectRayZ = reflectRayZAt(s).toVar();
        If(viewReflectRayZ.lessThanEqual(vZ), () => {
          const vP = getViewPosition(uvS, d, this._cameraProjectionMatrixInverse).toVar();
          const away = pointToLineDistance(vP, viewPosition, d1viewPosition).toVar();
          const uvNeighbor = uvS.add(uvPixelStepX).toVar();
          const vPNeighbor = getViewPosition(uvNeighbor, d, this._cameraProjectionMatrixInverse).toVar();
          const minThickness = vPNeighbor.x.sub(vP.x).mul(3).toVar();
          const tk = max(minThickness, this.thickness).toVar();
          If(away.lessThanEqual(tk), () => {
            const vN = this.normalNode.sample(uvS).rgb.normalize().toVar();
            if (this.stochastic === false) {
              If(dot(viewReflectDir, vN).greaterThanEqual(0), () => {
                Continue();
              });
              const distance2 = pointPlaneDistance(vP, viewPosition, viewNormal).toVar();
              If(distance2.greaterThan(this.maxDistance), () => {
                Break();
              });
            }
            foundHit.assign(true);
            hitUvS.assign(uvS);
            hitD.assign(d);
            if (this.binaryRefine) {
              hitSLo.assign(sampleFraction(float(i).sub(1)));
              hitSHi.assign(s);
            }
            Break();
          });
        });
      });
      If(foundHit, () => {
        if (this.binaryRefine) {
          Loop({ start: int(0), end: int(8), type: "int", condition: "<" }, () => {
            const sMid = hitSLo.add(hitSHi).mul(0.5).toVar();
            const sceneZMid = getViewZ(sampleDepth(screenPosAt(sMid).mul(invResolution)));
            If(reflectRayZAt(sMid).lessThanEqual(sceneZMid), () => {
              hitSHi.assign(sMid);
            }).Else(() => {
              hitSLo.assign(sMid);
            });
          });
          hitUvS.assign(screenPosAt(hitSHi).mul(invResolution));
          hitD.assign(sampleDepth(hitUvS));
        }
        const uvS = hitUvS;
        const vP = getViewPosition(uvS, hitD, this._cameraProjectionMatrixInverse).toVar();
        const distancePointPlane = this.stochastic === false ? pointPlaneDistance(vP, viewPosition, viewNormal).toVar() : float(0);
        const withinRange = distancePointPlane.lessThanEqual(this.maxDistance);
        If(withinRange, () => {
          const hitWorldPosition = this._cameraWorldMatrix.mul(vec4(vP, 1)).xyz.toVar();
          const worldDistance = distance(worldPosition, hitWorldPosition).mul(specDominantFactor).toVar();
          const reflectColor = this.colorNode.sample(uvS).toVar();
          reflectColor.rgb.assign(reprojectHitPointHistory(uvS, reflectColor.rgb));
          if (this.stochastic === true) applyHitEdgeFade(reflectColor, uvS, hitBorderWidth);
          let weightedColor = reflectColor.rgb.mul(finalSampleWeight);
          if (this.stochastic === false) {
            const ratio = float(1).sub(distancePointPlane.div(this.maxDistance)).toVar();
            const attenuation = ratio.mul(ratio).toVar();
            const fresnelCoe = div(dot(viewIncidentDir, viewReflectDir).add(1), 2).toVar();
            weightedColor = weightedColor.mul(attenuation.mul(fresnelCoe));
          }
          hit.assign(1);
          output.assign(vec4(weightedColor, worldDistance));
        });
      });
      If(hit.equal(0), () => {
        if (this.stochastic === true) {
          output.assign(vec4(sampleEnvReflection().mul(this.environmentIntensity), float(ENV_RAY_LENGTH)));
          if (this.screenEdgeFadeBlack) {
            output.rgb.mulAssign(surfaceBorderFactor);
          }
        }
      });
      const lum = luminance(output.rgb).max(1e-4).toVar();
      output.rgb.mulAssign(this.maxLuminance.div(lum).min(1));
      output.rgb.mulAssign(this.intensity);
      return output.max(0);
    });
    this._ssrFn = ssr2;
    this._sharedContext = builder.getSharedContext();
    this._buildSSRMaterial();
    const reflectionBuffer = texture(this._ssrRenderTarget.texture);
    if (this.stochastic === false) {
      this._buildBlurMaterial();
    }
    this._copyMaterial.fragmentNode = reflectionBuffer;
    this._copyMaterial.needsUpdate = true;
    return this.getTextureNode();
  }
  getRenderTarget() {
    return this._ssrRenderTarget;
  }
  /**
   * Frees internal resources. This method should be called
   * when the effect is no longer required.
   */
  dispose() {
    this._ssrRenderTarget.dispose();
    this._blurRenderTarget.dispose();
    this._ssrMaterial.dispose();
    this._blurMaterial.dispose();
    this._copyMaterial.dispose();
    if (this._importanceEnvironment !== null) {
      this._importanceEnvironment.dispose();
      this._importanceEnvironment = null;
    }
  }
}
export default SSRNode;
export const ssr = (colorNode, depthNode, normalNode, options = {}) => nodeObject(new SSRNode(
  nodeObject(colorNode),
  nodeObject(depthNode),
  nodeObject(normalNode),
  options
));
