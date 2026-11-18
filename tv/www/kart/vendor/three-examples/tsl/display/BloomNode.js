import { HalfFloatType, RenderTarget, Vector2, Vector3, TempNode, QuadMesh, NodeMaterial, RendererUtils, NodeUpdateType } from "three/webgpu";
import { nodeObject, Fn, float, uv, passTexture, uniform, Loop, texture, luminance, smoothstep, mix, vec4, uniformArray, add, int } from "three/tsl";
const _quadMesh = /* @__PURE__ */ new QuadMesh();
const _size = /* @__PURE__ */ new Vector2();
const _BlurDirectionX = /* @__PURE__ */ new Vector2(1, 0);
const _BlurDirectionY = /* @__PURE__ */ new Vector2(0, 1);
let _rendererState;
const luminosityHighPass = Fn(({ input, threshold, smoothWidth }) => {
  const v = luminance(input.rgb);
  const alpha = smoothstep(threshold, threshold.add(smoothWidth), v);
  return mix(vec4(0), input, alpha);
});
class BloomNode extends TempNode {
  static get type() {
    return "BloomNode";
  }
  /**
   * Constructs a new bloom node.
   *
   * @param {Node<vec4>} inputNode - The node that represents the input of the effect.
   * @param {number} [strength=1] - The strength of the bloom.
   * @param {number} [radius=0] - The radius of the bloom.
   * @param {number} [threshold=0] - The luminance threshold limits which bright areas contribute to the bloom effect.
   */
  constructor(inputNode, strength = 1, radius = 0, threshold = 0) {
    super("vec4");
    this.inputNode = inputNode;
    this.strength = strength.isNode ? strength : uniform(strength);
    this.radius = radius.isNode ? radius : uniform(radius);
    this.threshold = threshold.isNode ? threshold : uniform(threshold);
    this.smoothWidth = uniform(0.01);
    this._resolutionScale = 0.5;
    this.highPassFn = luminosityHighPass;
    this._renderTargetsHorizontal = [];
    this._renderTargetsVertical = [];
    this._nMips = 5;
    this._renderTargetBright = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
    this._renderTargetBright.texture.name = "UnrealBloomPass.bright";
    this._renderTargetBright.texture.generateMipmaps = false;
    for (let i = 0; i < this._nMips; i++) {
      const renderTargetHorizontal = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
      renderTargetHorizontal.texture.name = "UnrealBloomPass.h" + i;
      renderTargetHorizontal.texture.generateMipmaps = false;
      this._renderTargetsHorizontal.push(renderTargetHorizontal);
      const renderTargetVertical = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
      renderTargetVertical.texture.name = "UnrealBloomPass.v" + i;
      renderTargetVertical.texture.generateMipmaps = false;
      this._renderTargetsVertical.push(renderTargetVertical);
    }
    this._compositeMaterial = null;
    this._highPassFilterMaterial = null;
    this._separableBlurMaterials = [];
    this._textureNodeBright = texture(this._renderTargetBright.texture);
    this._textureNodeBlur0 = texture(this._renderTargetsVertical[0].texture);
    this._textureNodeBlur1 = texture(this._renderTargetsVertical[1].texture);
    this._textureNodeBlur2 = texture(this._renderTargetsVertical[2].texture);
    this._textureNodeBlur3 = texture(this._renderTargetsVertical[3].texture);
    this._textureNodeBlur4 = texture(this._renderTargetsVertical[4].texture);
    this._textureOutput = passTexture(this, this._renderTargetsHorizontal[0].texture);
    this.updateBeforeType = NodeUpdateType.FRAME;
  }
  /**
   * Returns the result of the effect as a texture node.
   *
   * @return {PassTextureNode} A texture node that represents the result of the effect.
   */
  getTextureNode() {
    return this._textureOutput;
  }
  /**
   * Sets the resolution scale for the pass.
   * The resolution scale is a factor that is multiplied with the renderer's width and height.
   *
   * @param {number} resolutionScale - The resolution scale to set. A value of `1` means full resolution.
   * @return {BloomNode} A reference to this node.
   */
  setResolutionScale(resolutionScale) {
    this._resolutionScale = resolutionScale;
    return this;
  }
  /**
   * Gets the current resolution scale of the pass.
   *
   * @return {number} The current resolution scale. A value of `1` means full resolution.
   */
  getResolutionScale() {
    return this._resolutionScale;
  }
  /**
   * Sets the size of the effect.
   *
   * @param {number} width - The width of the effect.
   * @param {number} height - The height of the effect.
   */
  setSize(width, height) {
    let resx = Math.floor(width * this._resolutionScale);
    let resy = Math.floor(height * this._resolutionScale);
    this._renderTargetBright.setSize(resx, resy);
    for (let i = 0; i < this._nMips; i++) {
      this._renderTargetsHorizontal[i].setSize(resx, resy);
      this._renderTargetsVertical[i].setSize(resx, resy);
      this._separableBlurMaterials[i].invSize.value.set(1 / resx, 1 / resy);
      resx = Math.floor(resx / 2);
      resy = Math.floor(resy / 2);
    }
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
    renderer.setRenderTarget(this._renderTargetBright);
    _quadMesh.material = this._highPassFilterMaterial;
    _quadMesh.name = "Bloom [ High Pass ]";
    _quadMesh.render(renderer);
    let inputRenderTarget = this._renderTargetBright;
    for (let i = 0; i < this._nMips; i++) {
      _quadMesh.material = this._separableBlurMaterials[i];
      this._separableBlurMaterials[i].colorTexture.value = inputRenderTarget.texture;
      this._separableBlurMaterials[i].direction.value = _BlurDirectionX;
      renderer.setRenderTarget(this._renderTargetsHorizontal[i]);
      _quadMesh.name = `Bloom [ Blur Horizontal - ${i} ]`;
      _quadMesh.render(renderer);
      this._separableBlurMaterials[i].colorTexture.value = this._renderTargetsHorizontal[i].texture;
      this._separableBlurMaterials[i].direction.value = _BlurDirectionY;
      renderer.setRenderTarget(this._renderTargetsVertical[i]);
      _quadMesh.name = `Bloom [ Blur Vertical - ${i} ]`;
      _quadMesh.render(renderer);
      inputRenderTarget = this._renderTargetsVertical[i];
    }
    renderer.setRenderTarget(this._renderTargetsHorizontal[0]);
    _quadMesh.material = this._compositeMaterial;
    _quadMesh.name = "Bloom [ Composite ]";
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
    this._highPassFilterMaterial = this._highPassFilterMaterial || new NodeMaterial();
    this._highPassFilterMaterial.fragmentNode = this.highPassFn({ input: this.inputNode, threshold: this.threshold, smoothWidth: this.smoothWidth }).context(builder.getSharedContext());
    this._highPassFilterMaterial.name = "Bloom_highPass";
    this._highPassFilterMaterial.needsUpdate = true;
    const kernelSizeArray = [6, 10, 14, 18, 22];
    for (let i = 0; i < this._nMips; i++) {
      this._separableBlurMaterials.push(this._getSeparableBlurMaterial(builder, kernelSizeArray[i]));
    }
    const bloomFactors = uniformArray([1, 0.8, 0.6, 0.4, 0.2]);
    const bloomTintColors = uniformArray([new Vector3(1, 1, 1), new Vector3(1, 1, 1), new Vector3(1, 1, 1), new Vector3(1, 1, 1), new Vector3(1, 1, 1)]);
    const lerpBloomFactor = Fn(([factor, radius]) => {
      const mirrorFactor = float(1.2).sub(factor);
      return mix(factor, mirrorFactor, radius);
    }).setLayout({
      name: "lerpBloomFactor",
      type: "float",
      inputs: [
        { name: "factor", type: "float" },
        { name: "radius", type: "float" }
      ]
    });
    const compositePass = Fn(() => {
      const color0 = lerpBloomFactor(bloomFactors.element(0), this.radius).mul(vec4(bloomTintColors.element(0), 1)).mul(this._textureNodeBlur0);
      const color1 = lerpBloomFactor(bloomFactors.element(1), this.radius).mul(vec4(bloomTintColors.element(1), 1)).mul(this._textureNodeBlur1);
      const color2 = lerpBloomFactor(bloomFactors.element(2), this.radius).mul(vec4(bloomTintColors.element(2), 1)).mul(this._textureNodeBlur2);
      const color3 = lerpBloomFactor(bloomFactors.element(3), this.radius).mul(vec4(bloomTintColors.element(3), 1)).mul(this._textureNodeBlur3);
      const color4 = lerpBloomFactor(bloomFactors.element(4), this.radius).mul(vec4(bloomTintColors.element(4), 1)).mul(this._textureNodeBlur4);
      const sum = color0.add(color1).add(color2).add(color3).add(color4);
      return sum.mul(this.strength);
    });
    this._compositeMaterial = this._compositeMaterial || new NodeMaterial();
    this._compositeMaterial.fragmentNode = compositePass().context(builder.getSharedContext());
    this._compositeMaterial.name = "Bloom_comp";
    this._compositeMaterial.needsUpdate = true;
    return this._textureOutput;
  }
  /**
   * Frees internal resources. This method should be called
   * when the effect is no longer required.
   */
  dispose() {
    for (let i = 0; i < this._renderTargetsHorizontal.length; i++) {
      this._renderTargetsHorizontal[i].dispose();
    }
    for (let i = 0; i < this._renderTargetsVertical.length; i++) {
      this._renderTargetsVertical[i].dispose();
    }
    this._renderTargetBright.dispose();
    if (this._highPassFilterMaterial !== null) this._highPassFilterMaterial.dispose();
    if (this._compositeMaterial !== null) this._compositeMaterial.dispose();
    for (let i = 0; i < this._separableBlurMaterials.length; i++) {
      this._separableBlurMaterials[i].dispose();
    }
  }
  /**
   * Create a separable blur material for the given kernel radius.
   *
   * @private
   * @param {NodeBuilder} builder - The current node builder.
   * @param {number} kernelRadius - The kernel radius.
   * @return {NodeMaterial}
   */
  _getSeparableBlurMaterial(builder, kernelRadius) {
    const coefficients = [];
    const sigma = kernelRadius / 3;
    for (let i = 0; i < kernelRadius; i++) {
      coefficients.push(0.39894 * Math.exp(-0.5 * i * i / (sigma * sigma)) / sigma);
    }
    const colorTexture = texture(null);
    const gaussianCoefficients = uniformArray(coefficients);
    const invSize = uniform(new Vector2());
    const direction = uniform(new Vector2(0.5, 0.5));
    const uvNode = uv();
    const sampleTexel = (uv2) => colorTexture.sample(uv2);
    const separableBlurPass = Fn(() => {
      const diffuseSum = sampleTexel(uvNode).rgb.mul(gaussianCoefficients.element(0)).toVar();
      Loop({ start: int(1), end: int(kernelRadius), type: "int", condition: "<" }, ({ i }) => {
        const x = float(i);
        const w = gaussianCoefficients.element(i);
        const uvOffset = direction.mul(invSize).mul(x);
        const sample1 = sampleTexel(uvNode.add(uvOffset)).rgb;
        const sample2 = sampleTexel(uvNode.sub(uvOffset)).rgb;
        diffuseSum.addAssign(add(sample1, sample2).mul(w));
      });
      return vec4(diffuseSum, 1);
    });
    const separableBlurMaterial = new NodeMaterial();
    separableBlurMaterial.fragmentNode = separableBlurPass().context(builder.getSharedContext());
    separableBlurMaterial.name = "Bloom_separable";
    separableBlurMaterial.needsUpdate = true;
    separableBlurMaterial.colorTexture = colorTexture;
    separableBlurMaterial.direction = direction;
    separableBlurMaterial.invSize = invSize;
    return separableBlurMaterial;
  }
}
export const bloom = (node, strength, radius, threshold) => new BloomNode(nodeObject(node), strength, radius, threshold);
export default BloomNode;
