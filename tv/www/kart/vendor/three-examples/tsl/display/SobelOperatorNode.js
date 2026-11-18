import { Vector2, TempNode, NodeUpdateType } from "three/webgpu";
import { Fn, uv, uniform, convertToTexture, vec2, vec3, vec4, mat3, luminance, add } from "three/tsl";
class SobelOperatorNode extends TempNode {
  static get type() {
    return "SobelOperatorNode";
  }
  /**
   * Constructs a new sobel operator node.
   *
   * @param {TextureNode} textureNode - The texture node that represents the input of the effect.
   */
  constructor(textureNode) {
    super("vec4");
    this.textureNode = textureNode;
    this.updateBeforeType = NodeUpdateType.FRAME;
    this._invSize = uniform(new Vector2());
  }
  /**
   * This method is used to update the effect's uniforms once per frame.
   *
   * @param {NodeFrame} frame - The current node frame.
   */
  updateBefore() {
    const map = this.textureNode.value;
    this._invSize.value.set(1 / map.image.width, 1 / map.image.height);
  }
  /**
   * This method is used to setup the effect's TSL code.
   *
   * @param {NodeBuilder} builder - The current node builder.
   * @return {ShaderCallNodeInternal}
   */
  setup() {
    const { textureNode } = this;
    const uvNode = textureNode.uvNode || uv();
    const sampleTexture = (uv2) => textureNode.sample(uv2);
    const sobel2 = Fn(() => {
      const texel = this._invSize;
      const Gx = mat3(-1, -2, -1, 0, 0, 0, 1, 2, 1);
      const Gy = mat3(-1, 0, 1, -2, 0, 2, -1, 0, 1);
      const tx0y0 = luminance(sampleTexture(uvNode.add(texel.mul(vec2(-1, -1)))).xyz);
      const tx0y1 = luminance(sampleTexture(uvNode.add(texel.mul(vec2(-1, 0)))).xyz);
      const tx0y2 = luminance(sampleTexture(uvNode.add(texel.mul(vec2(-1, 1)))).xyz);
      const tx1y0 = luminance(sampleTexture(uvNode.add(texel.mul(vec2(0, -1)))).xyz);
      const tx1y1 = luminance(sampleTexture(uvNode.add(texel.mul(vec2(0, 0)))).xyz);
      const tx1y2 = luminance(sampleTexture(uvNode.add(texel.mul(vec2(0, 1)))).xyz);
      const tx2y0 = luminance(sampleTexture(uvNode.add(texel.mul(vec2(1, -1)))).xyz);
      const tx2y1 = luminance(sampleTexture(uvNode.add(texel.mul(vec2(1, 0)))).xyz);
      const tx2y2 = luminance(sampleTexture(uvNode.add(texel.mul(vec2(1, 1)))).xyz);
      const valueGx = add(
        Gx[0][0].mul(tx0y0),
        Gx[1][0].mul(tx1y0),
        Gx[2][0].mul(tx2y0),
        Gx[0][1].mul(tx0y1),
        Gx[1][1].mul(tx1y1),
        Gx[2][1].mul(tx2y1),
        Gx[0][2].mul(tx0y2),
        Gx[1][2].mul(tx1y2),
        Gx[2][2].mul(tx2y2)
      );
      const valueGy = add(
        Gy[0][0].mul(tx0y0),
        Gy[1][0].mul(tx1y0),
        Gy[2][0].mul(tx2y0),
        Gy[0][1].mul(tx0y1),
        Gy[1][1].mul(tx1y1),
        Gy[2][1].mul(tx2y1),
        Gy[0][2].mul(tx0y2),
        Gy[1][2].mul(tx1y2),
        Gy[2][2].mul(tx2y2)
      );
      const G = valueGx.mul(valueGx).add(valueGy.mul(valueGy)).sqrt();
      return vec4(vec3(G), 1);
    });
    const outputNode = sobel2();
    return outputNode;
  }
}
export default SobelOperatorNode;
export const sobel = (node) => new SobelOperatorNode(convertToTexture(node));
