import { RenderTarget, Vector2, NodeMaterial, RendererUtils, QuadMesh, TempNode, NodeUpdateType } from "three/webgpu";
import { Fn, float, uv, uniform, convertToTexture, vec2, vec4, passTexture, luminance, abs, exp, max } from "three/tsl";
const _quadMesh = /* @__PURE__ */ new QuadMesh();
let _rendererState;
class BilateralBlurNode extends TempNode {
  static get type() {
    return "BilateralBlurNode";
  }
  /**
   * Constructs a new bilateral blur node.
   *
   * @param {TextureNode} textureNode - The texture node that represents the input of the effect.
   * @param {Node<vec2|float>} directionNode - Defines the direction and radius of the blur.
   * @param {number} sigma - Controls the spatial kernel of the blur filter. Higher values mean a wider blur radius.
   * @param {number} sigmaColor - Controls the intensity kernel. Higher values allow more color difference to be blurred together.
   */
  constructor(textureNode, directionNode = null, sigma = 4, sigmaColor = 0.1) {
    super("vec4");
    this.textureNode = textureNode;
    this.directionNode = directionNode;
    this.sigma = sigma;
    this.sigmaColor = sigmaColor;
    this._invSize = uniform(new Vector2());
    this._passDirection = uniform(new Vector2());
    this._horizontalRT = new RenderTarget(1, 1, { depthBuffer: false });
    this._horizontalRT.texture.name = "BilateralBlurNode.horizontal";
    this._verticalRT = new RenderTarget(1, 1, { depthBuffer: false });
    this._verticalRT.texture.name = "BilateralBlurNode.vertical";
    this._textureNode = passTexture(this, this._verticalRT.texture);
    this._textureNode.uvNode = textureNode.uvNode;
    this._material = null;
    this.updateBeforeType = NodeUpdateType.FRAME;
    this.resolutionScale = 1;
  }
  /**
   * Sets the size of the effect.
   *
   * @param {number} width - The width of the effect.
   * @param {number} height - The height of the effect.
   */
  setSize(width, height) {
    width = Math.max(Math.round(width * this.resolutionScale), 1);
    height = Math.max(Math.round(height * this.resolutionScale), 1);
    this._invSize.value.set(1 / width, 1 / height);
    this._horizontalRT.setSize(width, height);
    this._verticalRT.setSize(width, height);
  }
  /**
   * This method is used to render the effect once per frame.
   *
   * @param {NodeFrame} frame - The current node frame.
   */
  updateBefore(frame) {
    const { renderer } = frame;
    _rendererState = RendererUtils.resetRendererState(renderer, _rendererState);
    const textureNode = this.textureNode;
    const map = textureNode.value;
    const currentTexture = textureNode.value;
    _quadMesh.material = this._material;
    this.setSize(map.image.width, map.image.height);
    const textureType = map.type;
    this._horizontalRT.texture.type = textureType;
    this._verticalRT.texture.type = textureType;
    renderer.setRenderTarget(this._horizontalRT);
    this._passDirection.value.set(1, 0);
    _quadMesh.name = "Bilateral Blur [ Horizontal Pass ]";
    _quadMesh.render(renderer);
    textureNode.value = this._horizontalRT.texture;
    renderer.setRenderTarget(this._verticalRT);
    this._passDirection.value.set(0, 1);
    _quadMesh.name = "Bilateral Blur [ Vertical Pass ]";
    _quadMesh.render(renderer);
    textureNode.value = currentTexture;
    RendererUtils.restoreRendererState(renderer, _rendererState);
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
   * This method is used to setup the effect's TSL code.
   *
   * @param {NodeBuilder} builder - The current node builder.
   * @return {PassTextureNode}
   */
  setup(builder) {
    const textureNode = this.textureNode;
    const uvNode = uv();
    const directionNode = vec2(this.directionNode || 1);
    const sampleTexture = (uv2) => textureNode.sample(uv2);
    const blur = Fn(() => {
      const kernelSize = this.sigma * 2 + 3;
      const spatialCoefficients = this._getSpatialCoefficients(kernelSize);
      const invSize = this._invSize;
      const direction = directionNode.mul(this._passDirection);
      const centerColor = sampleTexture(uvNode).toVar();
      const centerLuminance = luminance(centerColor.rgb).toVar();
      const weightSum = float(spatialCoefficients[0]).toVar();
      const colorSum = vec4(centerColor.mul(spatialCoefficients[0])).toVar();
      const colorSigmaFactor = float(-0.5).div(float(this.sigmaColor * this.sigmaColor)).toConst();
      for (let i = 1; i < kernelSize; i++) {
        const x = float(i);
        const spatialWeight = float(spatialCoefficients[i]);
        const uvOffset = vec2(direction.mul(invSize.mul(x))).toVar();
        const sampleUv1 = uvNode.add(uvOffset);
        const sampleUv2 = uvNode.sub(uvOffset);
        const sample1 = sampleTexture(sampleUv1);
        const sample2 = sampleTexture(sampleUv2);
        const lum1 = luminance(sample1.rgb);
        const lum2 = luminance(sample2.rgb);
        const diff1 = abs(lum1.sub(centerLuminance));
        const diff2 = abs(lum2.sub(centerLuminance));
        const colorWeight1 = exp(diff1.mul(diff1).mul(colorSigmaFactor)).toVar();
        const colorWeight2 = exp(diff2.mul(diff2).mul(colorSigmaFactor)).toVar();
        const bilateralWeight1 = spatialWeight.mul(colorWeight1);
        const bilateralWeight2 = spatialWeight.mul(colorWeight2);
        colorSum.addAssign(sample1.mul(bilateralWeight1));
        colorSum.addAssign(sample2.mul(bilateralWeight2));
        weightSum.addAssign(bilateralWeight1);
        weightSum.addAssign(bilateralWeight2);
      }
      return colorSum.div(max(weightSum, 1e-4));
    });
    const material = this._material || (this._material = new NodeMaterial());
    material.fragmentNode = blur().context(builder.getSharedContext());
    material.name = "Bilateral_blur";
    material.needsUpdate = true;
    const properties = builder.getNodeProperties(this);
    properties.textureNode = textureNode;
    return this._textureNode;
  }
  /**
   * Frees internal resources. This method should be called
   * when the effect is no longer required.
   */
  dispose() {
    this._horizontalRT.dispose();
    this._verticalRT.dispose();
    if (this._material !== null) this._material.dispose();
  }
  /**
   * Computes spatial (Gaussian) coefficients depending on the given kernel radius.
   * These coefficients are used for the spatial component of the bilateral filter.
   *
   * @private
   * @param {number} kernelRadius - The kernel radius.
   * @return {Array<number>}
   */
  _getSpatialCoefficients(kernelRadius) {
    const coefficients = [];
    const sigma = kernelRadius / 3;
    for (let i = 0; i < kernelRadius; i++) {
      coefficients.push(0.39894 * Math.exp(-0.5 * i * i / (sigma * sigma)) / sigma);
    }
    return coefficients;
  }
}
export default BilateralBlurNode;
export const bilateralBlur = (node, directionNode, sigma, sigmaColor) => new BilateralBlurNode(convertToTexture(node), directionNode, sigma, sigmaColor);
