import { TempNode } from "three/webgpu";
import { Fn, uv, uniform, vec2, sin, cos, vec4, convertToTexture } from "three/tsl";
class RGBShiftNode extends TempNode {
  static get type() {
    return "RGBShiftNode";
  }
  /**
   * Constructs a new RGB shift node.
   *
   * @param {TextureNode} textureNode - The texture node that represents the input of the effect.
   * @param {number} [amount=0.005] - The amount of the RGB shift.
   * @param {number} [angle=0] - Defines the orientation in which colors are shifted.
   */
  constructor(textureNode, amount = 5e-3, angle = 0) {
    super("vec4");
    this.textureNode = textureNode;
    this.amount = uniform(amount);
    this.angle = uniform(angle);
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
    const rgbShift2 = Fn(() => {
      const offset = vec2(cos(this.angle), sin(this.angle)).mul(this.amount);
      const cr = sampleTexture(uvNode.add(offset));
      const cga = sampleTexture(uvNode);
      const cb = sampleTexture(uvNode.sub(offset));
      return vec4(cr.r, cga.g, cb.b, cga.a);
    });
    return rgbShift2();
  }
}
export default RGBShiftNode;
export const rgbShift = (node, amount, angle) => new RGBShiftNode(convertToTexture(node), amount, angle);
