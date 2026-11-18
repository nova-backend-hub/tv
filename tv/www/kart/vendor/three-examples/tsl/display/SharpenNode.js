import { HalfFloatType, RenderTarget, Vector2, NodeMaterial, RendererUtils, QuadMesh, TempNode, NodeUpdateType } from "three/webgpu";
import { Fn, float, vec3, vec4, ivec2, int, uv, floor, abs, max, min, exp2, nodeObject, passTexture, textureSize, textureLoad, convertToTexture } from "three/tsl";
const _quadMesh = /* @__PURE__ */ new QuadMesh();
const _size = /* @__PURE__ */ new Vector2();
let _rendererState;
class SharpenNode extends TempNode {
  static get type() {
    return "SharpenNode";
  }
  /**
   * Constructs a new sharpen node.
   *
   * @param {TextureNode} textureNode - The texture node that represents the input of the effect.
   * @param {Node<float>} [sharpness=0.2] - Sharpening strength. 0 = maximum sharpening, 2 = no sharpening.
   * @param {Node<bool>} [denoise=false] - Whether to attenuate sharpening in noisy areas.
   */
  constructor(textureNode, sharpness = 0.2, denoise = false) {
    super("vec4");
    this.isSharpenNode = true;
    this.textureNode = textureNode;
    this.sharpness = nodeObject(sharpness);
    this.denoise = nodeObject(denoise);
    this._renderTarget = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
    this._renderTarget.texture.name = "SharpenNode.output";
    this._textureNode = passTexture(this, this._renderTarget.texture);
    this._material = null;
    this.updateBeforeType = NodeUpdateType.FRAME;
  }
  /**
   * Sets the output size of the effect.
   *
   * @param {number} width - The width in pixels.
   * @param {number} height - The height in pixels.
   */
  setSize(width, height) {
    this._renderTarget.setSize(width, height);
  }
  /**
   * This method is used to render the effect once per frame.
   *
   * @param {NodeFrame} frame - The current node frame.
   */
  updateBefore(frame) {
    const { renderer } = frame;
    _rendererState = RendererUtils.resetRendererState(renderer, _rendererState);
    renderer.getDrawingBufferSize(_size);
    this.setSize(_size.x, _size.y);
    renderer.setRenderTarget(this._renderTarget);
    _quadMesh.material = this._material;
    _quadMesh.name = "Sharpen [ RCAS ]";
    _quadMesh.render(renderer);
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
    const inputTex = textureNode.value;
    const rcas = Fn(() => {
      const targetUV = uv();
      const texSize = textureSize(textureLoad(inputTex));
      const p = ivec2(int(floor(targetUV.x.mul(texSize.x))), int(floor(targetUV.y.mul(texSize.y)))).toConst();
      const e = textureLoad(inputTex, p);
      const b = textureLoad(inputTex, p.add(ivec2(0, -1)));
      const d = textureLoad(inputTex, p.add(ivec2(-1, 0)));
      const f = textureLoad(inputTex, p.add(ivec2(1, 0)));
      const h = textureLoad(inputTex, p.add(ivec2(0, 1)));
      const luma = (s) => s.g.add(s.b.add(s.r).mul(0.5));
      const bL = luma(b);
      const dL = luma(d);
      const eL = luma(e);
      const fL = luma(f);
      const hL = luma(h);
      const con = exp2(this.sharpness.negate()).toConst();
      const mn4 = min(min(b.rgb, d.rgb), min(f.rgb, h.rgb)).toConst();
      const mx4 = max(max(b.rgb, d.rgb), max(f.rgb, h.rgb)).toConst();
      const RCAS_LIMIT = float(0.25 - 1 / 16).toConst();
      const hitMin = min(mn4, e.rgb).div(mx4.mul(4)).toConst();
      const hitMax = vec3(1).sub(max(mx4, e.rgb)).div(mn4.mul(4).sub(4)).toConst();
      const lobeRGB = max(hitMin.negate(), hitMax).toConst();
      const lobe = max(
        RCAS_LIMIT.negate(),
        min(max(lobeRGB.r, max(lobeRGB.g, lobeRGB.b)), float(0))
      ).mul(con).toConst();
      const nz = bL.add(dL).add(fL).add(hL).mul(0.25).sub(eL).toConst();
      const nzRange = max(max(bL, dL), max(eL, max(fL, hL))).sub(min(min(bL, dL), min(eL, min(fL, hL)))).toConst();
      const nzFactor = float(1).sub(abs(nz).div(max(nzRange, float(1 / 65536))).saturate().mul(0.5)).toConst();
      const effectiveLobe = this.denoise.equal(true).select(lobe.mul(nzFactor), lobe).toConst();
      const result = b.rgb.add(d.rgb).add(f.rgb).add(h.rgb).mul(effectiveLobe).add(e.rgb).div(effectiveLobe.mul(4).add(1)).toConst();
      return vec4(result, e.a);
    });
    const context = builder.getSharedContext();
    const material = this._material || (this._material = new NodeMaterial());
    material.fragmentNode = rcas().context(context);
    material.name = "Sharpen_RCAS";
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
    this._renderTarget.dispose();
    if (this._material !== null) this._material.dispose();
  }
}
export default SharpenNode;
export const sharpen = (node, sharpness, denoise) => new SharpenNode(convertToTexture(node), sharpness, denoise);
