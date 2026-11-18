import { HalfFloatType, RenderTarget, Vector2, NodeMaterial, RendererUtils, QuadMesh, TempNode, NodeUpdateType } from "three/webgpu";
import { Fn, float, vec2, vec3, vec4, ivec2, int, uv, floor, fract, abs, max, min, clamp, saturate, sqrt, select, exp2, nodeObject, passTexture, textureSize, textureLoad, convertToTexture } from "three/tsl";
const _quadMesh = /* @__PURE__ */ new QuadMesh();
const _size = /* @__PURE__ */ new Vector2();
let _rendererState;
class FSR1Node extends TempNode {
  static get type() {
    return "FSR1Node";
  }
  /**
   * Constructs a new FSR 1 node.
   *
   * @param {TextureNode} textureNode - The texture node that represents the input of the effect.
   * @param {Node<float>} [sharpness=0.2] - RCAS sharpening strength. 0 = maximum sharpening, 2 = no sharpening.
   * @param {Node<bool>} [denoise=false] - Whether to attenuate RCAS sharpening in noisy areas.
   */
  constructor(textureNode, sharpness = 0.2, denoise = false) {
    super("vec4");
    this.textureNode = textureNode;
    this.sharpness = nodeObject(sharpness);
    this.denoise = nodeObject(denoise);
    this._easuRT = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
    this._easuRT.texture.name = "FSR1Node.easu";
    this._rcasRT = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
    this._rcasRT.texture.name = "FSR1Node.rcas";
    this._textureNode = passTexture(this, this._rcasRT.texture);
    this._easuMaterial = null;
    this._rcasMaterial = null;
    this.updateBeforeType = NodeUpdateType.FRAME;
  }
  /**
   * Sets the output size of the effect.
   *
   * @param {number} width - The width in pixels.
   * @param {number} height - The height in pixels.
   */
  setSize(width, height) {
    this._easuRT.setSize(width, height);
    this._rcasRT.setSize(width, height);
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
    renderer.setRenderTarget(this._easuRT);
    _quadMesh.material = this._easuMaterial;
    _quadMesh.name = "FSR1 [ EASU Pass ]";
    _quadMesh.render(renderer);
    renderer.setRenderTarget(this._rcasRT);
    _quadMesh.material = this._rcasMaterial;
    _quadMesh.name = "FSR1 [ RCAS Pass ]";
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
    const _accumulateEdge = (dir, len, w, aL, bL, cL, dL, eL) => {
      const dc = dL.sub(cL).toConst();
      const cb = cL.sub(bL).toConst();
      const dirX = dL.sub(bL).toConst();
      const lenX = max(abs(dc), abs(cb)).toConst();
      const sLenX = saturate(abs(dirX).div(max(lenX, float(1 / 65536)))).toConst();
      dir.x.addAssign(dirX.mul(w));
      len.addAssign(sLenX.mul(sLenX).mul(w));
      const ec = eL.sub(cL).toConst();
      const ca = cL.sub(aL).toConst();
      const dirY = eL.sub(aL).toConst();
      const lenY = max(abs(ec), abs(ca)).toConst();
      const sLenY = saturate(abs(dirY).div(max(lenY, float(1 / 65536)))).toConst();
      dir.y.addAssign(dirY.mul(w));
      len.addAssign(sLenY.mul(sLenY).mul(w));
    };
    const _accumulateTap = (aC, aW, offset, dir, len2, lob, clp, color) => {
      const vx = offset.x.mul(dir.x).add(offset.y.mul(dir.y)).toConst();
      const vy = offset.x.mul(dir.y).negate().add(offset.y.mul(dir.x)).toConst();
      const sx = vx.mul(len2.x).toConst();
      const sy = vy.mul(len2.y).toConst();
      const d2 = min(sx.mul(sx).add(sy.mul(sy)), clp).toConst();
      const wB = d2.mul(2 / 5).sub(1).toConst();
      const wA = d2.mul(lob).sub(1).toConst();
      const w = wB.mul(wB).mul(25 / 16).sub(25 / 16 - 1).mul(wA.mul(wA)).toConst();
      aC.addAssign(color.mul(w));
      aW.addAssign(w);
    };
    const easu = Fn(() => {
      const targetUV = uv();
      const texSize = vec2(textureSize(textureNode));
      const pp = targetUV.mul(texSize).sub(0.5).toConst();
      const fp = floor(pp).toConst();
      const f = fract(pp).toConst();
      const ifp = ivec2(int(fp.x), int(fp.y)).toConst();
      const tap = (dx, dy) => textureLoad(inputTex, ifp.add(ivec2(dx, dy)));
      const sB = tap(0, -1), sC = tap(1, -1);
      const sE = tap(-1, 0), sF = tap(0, 0), sG = tap(1, 0), sH = tap(2, 0);
      const sI = tap(-1, 1), sJ = tap(0, 1), sK = tap(1, 1), sL = tap(2, 1);
      const sN = tap(0, 2), sO = tap(1, 2);
      const luma = (s) => s.r.mul(0.5).add(s.g).add(s.b.mul(0.5));
      const bL = luma(sB), cL = luma(sC);
      const eL = luma(sE), fL = luma(sF), gL = luma(sG), hL = luma(sH);
      const iL = luma(sI), jL = luma(sJ), kL = luma(sK), lL = luma(sL);
      const nL = luma(sN), oL = luma(sO);
      const dir = vec2(0).toVar();
      const len = float(0).toVar();
      const w0 = float(1).sub(f.x).mul(float(1).sub(f.y)).toConst();
      const w1 = f.x.mul(float(1).sub(f.y)).toConst();
      const w2 = float(1).sub(f.x).mul(f.y).toConst();
      const w3 = f.x.mul(f.y).toConst();
      _accumulateEdge(dir, len, w0, bL, eL, fL, gL, jL);
      _accumulateEdge(dir, len, w1, cL, fL, gL, hL, kL);
      _accumulateEdge(dir, len, w2, fL, iL, jL, kL, nL);
      _accumulateEdge(dir, len, w3, gL, jL, kL, lL, oL);
      const dirSq = dir.x.mul(dir.x).add(dir.y.mul(dir.y)).toConst();
      const zro = dirSq.lessThan(1 / 32768).toConst();
      const rDirLen = float(1).div(sqrt(max(dirSq, float(1 / 32768)))).toConst();
      dir.x.assign(select(zro, float(1), dir.x));
      dir.mulAssign(select(zro, float(1), rDirLen));
      len.assign(len.mul(0.5));
      len.mulAssign(len);
      const stretch = dir.x.mul(dir.x).add(dir.y.mul(dir.y)).div(max(abs(dir.x), abs(dir.y))).toConst();
      const len2 = vec2(
        float(1).add(stretch.sub(1).mul(len)),
        float(1).sub(len.mul(0.5))
      ).toConst();
      const lob = float(0.5).add(float(1 / 4 - 0.04 - 0.5).mul(len)).toConst();
      const clp = float(1).div(lob).toConst();
      const aC = vec4(0).toVar();
      const aW = float(0).toVar();
      _accumulateTap(aC, aW, vec2(0, -1).sub(f), dir, len2, lob, clp, sB);
      _accumulateTap(aC, aW, vec2(1, -1).sub(f), dir, len2, lob, clp, sC);
      _accumulateTap(aC, aW, vec2(-1, 0).sub(f), dir, len2, lob, clp, sE);
      _accumulateTap(aC, aW, vec2(0, 0).sub(f), dir, len2, lob, clp, sF);
      _accumulateTap(aC, aW, vec2(1, 0).sub(f), dir, len2, lob, clp, sG);
      _accumulateTap(aC, aW, vec2(2, 0).sub(f), dir, len2, lob, clp, sH);
      _accumulateTap(aC, aW, vec2(-1, 1).sub(f), dir, len2, lob, clp, sI);
      _accumulateTap(aC, aW, vec2(0, 1).sub(f), dir, len2, lob, clp, sJ);
      _accumulateTap(aC, aW, vec2(1, 1).sub(f), dir, len2, lob, clp, sK);
      _accumulateTap(aC, aW, vec2(2, 1).sub(f), dir, len2, lob, clp, sL);
      _accumulateTap(aC, aW, vec2(0, 2).sub(f), dir, len2, lob, clp, sN);
      _accumulateTap(aC, aW, vec2(1, 2).sub(f), dir, len2, lob, clp, sO);
      aC.divAssign(aW);
      const min4 = min(min(sF, sG), min(sJ, sK)).toConst();
      const max4 = max(max(sF, sG), max(sJ, sK)).toConst();
      return clamp(aC, min4, max4);
    });
    const easuTex = this._easuRT.texture;
    const rcas = Fn(() => {
      const targetUV = uv();
      const texSize = vec2(textureSize(textureLoad(easuTex)));
      const p = ivec2(int(floor(targetUV.x.mul(texSize.x))), int(floor(targetUV.y.mul(texSize.y)))).toConst();
      const e = textureLoad(easuTex, p);
      const b = textureLoad(easuTex, p.add(ivec2(0, -1)));
      const d = textureLoad(easuTex, p.add(ivec2(-1, 0)));
      const f = textureLoad(easuTex, p.add(ivec2(1, 0)));
      const h = textureLoad(easuTex, p.add(ivec2(0, 1)));
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
    const easuMaterial = this._easuMaterial || (this._easuMaterial = new NodeMaterial());
    easuMaterial.fragmentNode = easu().context(context);
    easuMaterial.name = "FSR1_EASU";
    easuMaterial.needsUpdate = true;
    const rcasMaterial = this._rcasMaterial || (this._rcasMaterial = new NodeMaterial());
    rcasMaterial.fragmentNode = rcas().context(context);
    rcasMaterial.name = "FSR1_RCAS";
    rcasMaterial.needsUpdate = true;
    const properties = builder.getNodeProperties(this);
    properties.textureNode = textureNode;
    return this._textureNode;
  }
  /**
   * Frees internal resources. This method should be called
   * when the effect is no longer required.
   */
  dispose() {
    this._easuRT.dispose();
    this._rcasRT.dispose();
    if (this._easuMaterial !== null) this._easuMaterial.dispose();
    if (this._rcasMaterial !== null) this._rcasMaterial.dispose();
  }
}
export default FSR1Node;
export const fsr1 = (node, sharpness, denoise) => new FSR1Node(convertToTexture(node), sharpness, denoise);
