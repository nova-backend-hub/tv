import { DataTexture, RenderTarget, RepeatWrapping, Vector2, Vector3, TempNode, QuadMesh, NodeMaterial, RendererUtils, RedFormat } from "three/webgpu";
import { reference, logarithmicDepthToViewZ, viewZToPerspectiveDepth, getNormalFromDepth, getScreenPosition, getViewPosition, nodeObject, Fn, float, NodeUpdateType, uv, uniform, Loop, vec2, vec3, vec4, int, dot, max, pow, abs, If, textureSize, sin, cos, PI, texture, passTexture, mat3, add, normalize, mul, cross, div, mix, acos, clamp } from "three/tsl";
const _quadMesh = /* @__PURE__ */ new QuadMesh();
const _size = /* @__PURE__ */ new Vector2();
const _temporalRotations = [60, 300, 180, 240, 120, 0];
let _rendererState;
class GTAONode extends TempNode {
  static get type() {
    return "GTAONode";
  }
  /**
   * Constructs a new GTAO node.
   *
   * @param {Node<float>} depthNode - A node that represents the scene's depth.
   * @param {?Node<vec3>} normalNode - A node that represents the scene's normals.
   * @param {Camera} camera - The camera the scene is rendered with.
   */
  constructor(depthNode, normalNode, camera) {
    super("float");
    this.depthNode = depthNode;
    this.normalNode = normalNode;
    this.resolutionScale = 1;
    this.updateBeforeType = NodeUpdateType.FRAME;
    this._aoRenderTarget = new RenderTarget(1, 1, { depthBuffer: false, format: RedFormat });
    this._aoRenderTarget.texture.name = "GTAONode.AO";
    this.radius = uniform(0.25);
    this.resolution = uniform(new Vector2());
    this.thickness = uniform(1);
    this.distanceExponent = uniform(1);
    this.distanceFallOff = uniform(1);
    this.scale = uniform(1);
    this.samples = uniform(16);
    this.useTemporalFiltering = false;
    this._noiseNode = texture(generateMagicSquareNoise());
    this._cameraProjectionMatrix = uniform(camera.projectionMatrix);
    this._cameraProjectionMatrixInverse = uniform(camera.projectionMatrixInverse);
    this._cameraNear = reference("near", "float", camera);
    this._cameraFar = reference("far", "float", camera);
    this._temporalDirection = uniform(0);
    this._material = new NodeMaterial();
    this._material.name = "GTAO";
    this._textureNode = passTexture(this, this._aoRenderTarget.texture);
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
    this.resolution.value.set(width, height);
    this._aoRenderTarget.setSize(width, height);
  }
  /**
   * This method is used to render the effect once per frame.
   *
   * @param {NodeFrame} frame - The current node frame.
   */
  updateBefore(frame) {
    const { renderer } = frame;
    _rendererState = RendererUtils.resetRendererState(renderer, _rendererState);
    if (this.useTemporalFiltering === true) {
      const frameId = frame.frameId;
      this._temporalDirection.value = _temporalRotations[frameId % 6] / 360;
    } else {
      this._temporalDirection.value = 0;
    }
    const size = renderer.getDrawingBufferSize(_size);
    this.setSize(size.width, size.height);
    _quadMesh.material = this._material;
    _quadMesh.name = "AO";
    renderer.setClearColor(16777215, 1);
    renderer.setRenderTarget(this._aoRenderTarget);
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
    const sampleDepth = (uv2) => {
      const depth = this.depthNode.sample(uv2).r;
      if (builder.renderer.logarithmicDepthBuffer === true) {
        const viewZ = logarithmicDepthToViewZ(depth, this._cameraNear, this._cameraFar);
        return viewZToPerspectiveDepth(viewZ, this._cameraNear, this._cameraFar);
      }
      return depth;
    };
    const sampleNoise = (uv2) => this._noiseNode.sample(uv2);
    const sampleNormal = (uv2) => this.normalNode !== null ? this.normalNode.sample(uv2).rgb.normalize() : getNormalFromDepth(uv2, this.depthNode.value, this._cameraProjectionMatrixInverse);
    const ao2 = Fn(() => {
      const depth = sampleDepth(uvNode).toVar();
      depth.greaterThanEqual(1).discard();
      const viewPosition = getViewPosition(uvNode, depth, this._cameraProjectionMatrixInverse).toVar();
      const viewNormal = sampleNormal(uvNode).toVar();
      const radiusToUse = this.radius;
      const noiseResolution = textureSize(this._noiseNode, 0);
      let noiseUv = vec2(uvNode.x, uvNode.y.oneMinus());
      noiseUv = noiseUv.mul(this.resolution.div(noiseResolution));
      const noiseTexel = sampleNoise(noiseUv);
      const randomVec = noiseTexel.xyz.mul(2).sub(1);
      const tangent = vec3(randomVec.xy, 0).normalize();
      const bitangent = vec3(tangent.y.mul(-1), tangent.x, 0);
      const kernelMatrix = mat3(tangent, bitangent, vec3(0, 0, 1));
      const DIRECTIONS = this.samples.lessThan(30).select(3, 5).toVar();
      const STEPS = add(this.samples, DIRECTIONS.sub(1)).div(DIRECTIONS).toVar();
      const ao3 = float(0).toVar();
      Loop({ start: int(0), end: DIRECTIONS, type: "int", condition: "<" }, ({ i }) => {
        const angle = float(i).div(float(DIRECTIONS)).mul(PI).add(this._temporalDirection).toVar();
        const sampleDir = vec4(cos(angle), sin(angle), 0, add(0.5, mul(0.5, noiseTexel.w)));
        sampleDir.xyz = normalize(kernelMatrix.mul(sampleDir.xyz));
        const viewDir = normalize(viewPosition.xyz.negate()).toVar();
        const sliceBitangent = normalize(cross(sampleDir.xyz, viewDir)).toVar();
        const sliceTangent = cross(sliceBitangent, viewDir).toVar();
        const projNRaw = viewNormal.sub(sliceBitangent.mul(dot(viewNormal, sliceBitangent))).toVar();
        const projNLen = projNRaw.length().toVar();
        const projN = projNRaw.div(max(projNLen, float(1e-4))).toVar();
        const nSin = dot(projN, sliceTangent).toVar();
        const nCos = clamp(dot(projN, viewDir), 0, 1).toVar();
        const signNSin = nSin.greaterThanEqual(0).select(float(1), float(-1));
        const angleN = signNSin.mul(acos(nCos)).toVar();
        const tangentToNormalInSlice = cross(projN, sliceBitangent).toVar();
        const cosHorizons = vec2(dot(viewDir, tangentToNormalInSlice), dot(viewDir, tangentToNormalInSlice.negate())).toVar();
        Loop({ end: STEPS, type: "int", name: "j", condition: "<" }, ({ j }) => {
          const sampleViewOffset = sampleDir.xyz.mul(radiusToUse).mul(sampleDir.w).mul(pow(div(float(j).add(1), float(STEPS)), this.distanceExponent));
          const sampleScreenPositionX = getScreenPosition(viewPosition.add(sampleViewOffset), this._cameraProjectionMatrix).toVar();
          const sampleDepthX = sampleDepth(sampleScreenPositionX).toVar();
          const sampleSceneViewPositionX = getViewPosition(sampleScreenPositionX, sampleDepthX, this._cameraProjectionMatrixInverse).toVar();
          const viewDeltaX = sampleSceneViewPositionX.sub(viewPosition).toVar();
          If(abs(viewDeltaX.z).lessThan(this.thickness), () => {
            const sampleCosHorizon = dot(viewDir, normalize(viewDeltaX));
            cosHorizons.x.addAssign(max(0, mul(sampleCosHorizon.sub(cosHorizons.x), mix(1, float(2).div(float(j).add(2)), this.distanceFallOff))));
          });
          const sampleScreenPositionY = getScreenPosition(viewPosition.sub(sampleViewOffset), this._cameraProjectionMatrix).toVar();
          const sampleDepthY = sampleDepth(sampleScreenPositionY).toVar();
          const sampleSceneViewPositionY = getViewPosition(sampleScreenPositionY, sampleDepthY, this._cameraProjectionMatrixInverse).toVar();
          const viewDeltaY = sampleSceneViewPositionY.sub(viewPosition).toVar();
          If(abs(viewDeltaY.z).lessThan(this.thickness), () => {
            const sampleCosHorizon = dot(viewDir, normalize(viewDeltaY));
            cosHorizons.y.addAssign(max(0, mul(sampleCosHorizon.sub(cosHorizons.y), mix(1, float(2).div(float(j).add(2)), this.distanceFallOff))));
          });
        });
        const hPos = acos(cosHorizons.y).toVar();
        const hNeg = acos(cosHorizons.x).negate().toVar();
        const termPos = cos(hPos.mul(2).sub(angleN)).negate().add(nCos).add(hPos.mul(2).mul(nSin));
        const termNeg = cos(hNeg.mul(2).sub(angleN)).negate().add(nCos).add(hNeg.mul(2).mul(nSin));
        const a = termPos.add(termNeg).mul(0.25);
        ao3.addAssign(projNLen.mul(a));
      });
      ao3.assign(clamp(ao3.div(DIRECTIONS), 0, 1));
      ao3.assign(pow(ao3, this.scale));
      return ao3;
    });
    this._material.fragmentNode = ao2().context(builder.getSharedContext());
    this._material.needsUpdate = true;
    return this._textureNode;
  }
  /**
   * Frees internal resources. This method should be called
   * when the effect is no longer required.
   */
  dispose() {
    this._aoRenderTarget.dispose();
    this._material.dispose();
  }
}
export default GTAONode;
function generateMagicSquareNoise(size = 5) {
  const noiseSize = Math.floor(size) % 2 === 0 ? Math.floor(size) + 1 : Math.floor(size);
  const magicSquare = generateMagicSquare(noiseSize);
  const noiseSquareSize = magicSquare.length;
  const data = new Uint8Array(noiseSquareSize * 4);
  for (let inx = 0; inx < noiseSquareSize; ++inx) {
    const iAng = magicSquare[inx];
    const angle = 2 * Math.PI * iAng / noiseSquareSize;
    const randomVec = new Vector3(
      Math.cos(angle),
      Math.sin(angle),
      0
    ).normalize();
    data[inx * 4] = (randomVec.x * 0.5 + 0.5) * 255;
    data[inx * 4 + 1] = (randomVec.y * 0.5 + 0.5) * 255;
    data[inx * 4 + 2] = 127;
    data[inx * 4 + 3] = 255;
  }
  const noiseTexture = new DataTexture(data, noiseSize, noiseSize);
  noiseTexture.wrapS = RepeatWrapping;
  noiseTexture.wrapT = RepeatWrapping;
  noiseTexture.needsUpdate = true;
  return noiseTexture;
}
function generateMagicSquare(size) {
  const noiseSize = Math.floor(size) % 2 === 0 ? Math.floor(size) + 1 : Math.floor(size);
  const noiseSquareSize = noiseSize * noiseSize;
  const magicSquare = Array(noiseSquareSize).fill(0);
  let i = Math.floor(noiseSize / 2);
  let j = noiseSize - 1;
  for (let num = 1; num <= noiseSquareSize; ) {
    if (i === -1 && j === noiseSize) {
      j = noiseSize - 2;
      i = 0;
    } else {
      if (j === noiseSize) {
        j = 0;
      }
      if (i < 0) {
        i = noiseSize - 1;
      }
    }
    if (magicSquare[i * noiseSize + j] !== 0) {
      j -= 2;
      i++;
      continue;
    } else {
      magicSquare[i * noiseSize + j] = num++;
    }
    j++;
    i--;
  }
  return magicSquare;
}
export const ao = (depthNode, normalNode, camera) => new GTAONode(nodeObject(depthNode), nodeObject(normalNode), camera);
