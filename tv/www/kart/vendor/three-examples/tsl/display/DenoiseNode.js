import { DataTexture, RepeatWrapping, Vector2, Vector3, TempNode } from "three/webgpu";
import { texture, getNormalFromDepth, getViewPosition, convertToTexture, nodeObject, Fn, float, NodeUpdateType, uv, uniform, Loop, luminance, vec2, vec3, vec4, uniformArray, int, dot, max, pow, abs, If, textureSize, sin, cos, mat2, PI, property } from "three/tsl";
import { SimplexNoise } from "../../math/SimplexNoise.js";
class DenoiseNode extends TempNode {
  static get type() {
    return "DenoiseNode";
  }
  /**
   * Constructs a new denoise node.
   *
   * @param {TextureNode} textureNode - The texture node that represents the input of the effect (e.g. AO).
   * @param {Node<float>} depthNode - A node that represents the scene's depth.
   * @param {?Node<vec3>} normalNode - A node that represents the scene's normals.
   * @param {Camera} camera - The camera the scene is rendered with.
   */
  constructor(textureNode, depthNode, normalNode, camera) {
    super("vec4");
    this.textureNode = textureNode;
    this.depthNode = depthNode;
    this.normalNode = normalNode;
    this.noiseNode = texture(generateDefaultNoise());
    this.lumaPhi = uniform(5);
    this.depthPhi = uniform(5);
    this.normalPhi = uniform(5);
    this.radius = uniform(5);
    this.index = uniform(0);
    this.updateBeforeType = NodeUpdateType.FRAME;
    this._resolution = uniform(new Vector2());
    this._sampleVectors = uniformArray(generateDenoiseSamples(16, 2, 1));
    this._cameraProjectionMatrixInverse = uniform(camera.projectionMatrixInverse);
  }
  /**
   * This method is used to update internal uniforms once per frame.
   *
   * @param {NodeFrame} frame - The current node frame.
   */
  updateBefore() {
    const map = this.textureNode.value;
    this._resolution.value.set(map.image.width, map.image.height);
  }
  /**
   * This method is used to setup the effect's TSL code.
   *
   * @param {NodeBuilder} builder - The current node builder.
   * @return {ShaderCallNodeInternal}
   */
  setup() {
    const uvNode = uv();
    const sampleTexture = (uv2) => this.textureNode.sample(uv2);
    const sampleDepth = (uv2) => this.depthNode.sample(uv2).x;
    const sampleNormal = (uv2) => this.normalNode !== null ? this.normalNode.sample(uv2).rgb.normalize() : getNormalFromDepth(uv2, this.depthNode.value, this._cameraProjectionMatrixInverse);
    const sampleNoise = (uv2) => this.noiseNode.sample(uv2);
    const denoiseSample = Fn(([center, viewNormal, viewPosition, sampleUv]) => {
      const texel = sampleTexture(sampleUv).toVar();
      const depth = sampleDepth(sampleUv).toVar();
      const normal = sampleNormal(sampleUv).toVar();
      const neighborColor = texel.rgb;
      const viewPos = getViewPosition(sampleUv, depth, this._cameraProjectionMatrixInverse).toVar();
      const normalDiff = dot(viewNormal, normal).toVar();
      const normalSimilarity = pow(max(normalDiff, 0), this.normalPhi).toVar();
      const lumaDiff = abs(luminance(neighborColor).sub(luminance(center))).toVar();
      const lumaSimilarity = max(float(1).sub(lumaDiff.div(this.lumaPhi)), 0).toVar();
      const depthDiff = abs(dot(viewPosition.sub(viewPos), viewNormal)).toVar();
      const depthSimilarity = max(float(1).sub(depthDiff.div(this.depthPhi)), 0);
      const w = lumaSimilarity.mul(depthSimilarity).mul(normalSimilarity);
      return vec4(neighborColor.mul(w), w);
    });
    const denoise2 = Fn(
      ([uvNode2]) => {
        const depth = sampleDepth(uvNode2).toVar();
        const viewNormal = sampleNormal(uvNode2).toVar();
        const texel = sampleTexture(uvNode2).toVar();
        const result = property("vec4");
        If(depth.greaterThanEqual(1).or(dot(viewNormal, viewNormal).equal(0)), () => {
          result.assign(texel);
        }).Else(() => {
          const center = vec3(texel.rgb);
          const viewPosition = getViewPosition(uvNode2, depth, this._cameraProjectionMatrixInverse).toConst();
          const noiseResolution = textureSize(this.noiseNode, 0);
          let noiseUv = vec2(uvNode2.x, uvNode2.y.oneMinus());
          noiseUv = noiseUv.mul(this._resolution.div(noiseResolution));
          const noiseTexel = sampleNoise(noiseUv).toVar();
          const x = sin(noiseTexel.element(this.index.mod(4).mul(2).mul(PI)));
          const y = cos(noiseTexel.element(this.index.mod(4).mul(2).mul(PI)));
          const noiseVec = vec2(x, y);
          const rotationMatrix = mat2(noiseVec.x, noiseVec.y.negate(), noiseVec.x, noiseVec.y);
          const totalWeight = float(1).toVar();
          const denoised = vec3(texel.rgb).toVar();
          Loop({ start: int(0), end: int(16), type: "int", condition: "<" }, ({ i }) => {
            const sampleDir = this._sampleVectors.element(i);
            const offset = rotationMatrix.mul(sampleDir.xy.mul(float(1).add(sampleDir.z.mul(this.radius.sub(1))))).div(this._resolution);
            const sampleUv = uvNode2.add(offset);
            const sampleResult = denoiseSample(center, viewNormal, viewPosition, sampleUv);
            denoised.addAssign(sampleResult.xyz);
            totalWeight.addAssign(sampleResult.w);
          });
          If(totalWeight.greaterThan(float(0)), () => {
            denoised.divAssign(totalWeight);
          });
          result.assign(vec4(denoised, texel.a));
        });
        return result;
      }
      /*, { uv: 'vec2', return: 'vec4' }*/
    );
    const output = Fn(() => {
      return denoise2(uvNode);
    });
    const outputNode = output();
    return outputNode;
  }
}
export default DenoiseNode;
function generateDenoiseSamples(numSamples, numRings, radiusExponent) {
  const samples = [];
  for (let i = 0; i < numSamples; i++) {
    const angle = 2 * Math.PI * numRings * i / numSamples;
    const radius = Math.pow(i / (numSamples - 1), radiusExponent);
    samples.push(new Vector3(Math.cos(angle), Math.sin(angle), radius));
  }
  return samples;
}
function generateDefaultNoise(size = 64) {
  const simplex = new SimplexNoise();
  const arraySize = size * size * 4;
  const data = new Uint8Array(arraySize);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const x = i;
      const y = j;
      data[(i * size + j) * 4] = (simplex.noise(x, y) * 0.5 + 0.5) * 255;
      data[(i * size + j) * 4 + 1] = (simplex.noise(x + size, y) * 0.5 + 0.5) * 255;
      data[(i * size + j) * 4 + 2] = (simplex.noise(x, y + size) * 0.5 + 0.5) * 255;
      data[(i * size + j) * 4 + 3] = (simplex.noise(x + size, y + size) * 0.5 + 0.5) * 255;
    }
  }
  const noiseTexture = new DataTexture(data, size, size);
  noiseTexture.wrapS = RepeatWrapping;
  noiseTexture.wrapT = RepeatWrapping;
  noiseTexture.needsUpdate = true;
  return noiseTexture;
}
export const denoise = (node, depthNode, normalNode, camera) => new DenoiseNode(convertToTexture(node), nodeObject(depthNode), nodeObject(normalNode), camera);
