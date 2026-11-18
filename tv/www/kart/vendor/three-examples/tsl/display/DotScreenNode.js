import { TempNode } from "three/webgpu";
import { nodeObject, Fn, uv, uniform, vec2, vec3, sin, cos, add, vec4, screenSize } from "three/tsl";
class DotScreenNode extends TempNode {
  static get type() {
    return "DotScreenNode";
  }
  /**
   * Constructs a new dot screen node.
   *
   * @param {Node} inputNode - The node that represents the input of the effect.
   * @param {number} [angle=1.57] - The rotation of the effect in radians.
   * @param {number} [scale=1] - The scale of the effect. A higher value means smaller dots.
   */
  constructor(inputNode, angle = 1.57, scale = 1) {
    super("vec4");
    this.inputNode = inputNode;
    this.angle = uniform(angle);
    this.scale = uniform(scale);
  }
  /**
   * This method is used to setup the effect's TSL code.
   *
   * @param {NodeBuilder} builder - The current node builder.
   * @return {ShaderCallNodeInternal}
   */
  setup() {
    const inputNode = this.inputNode;
    const pattern = Fn(() => {
      const s = sin(this.angle);
      const c = cos(this.angle);
      const tex = uv().mul(screenSize);
      const point = vec2(c.mul(tex.x).sub(s.mul(tex.y)), s.mul(tex.x).add(c.mul(tex.y))).mul(this.scale);
      return sin(point.x).mul(sin(point.y)).mul(4);
    });
    const dotScreen2 = Fn(() => {
      const color = inputNode;
      const average = add(color.r, color.g, color.b).div(3);
      return vec4(vec3(average.mul(10).sub(5).add(pattern())), color.a);
    });
    const outputNode = dotScreen2();
    return outputNode;
  }
}
export default DotScreenNode;
export const dotScreen = (node, angle, scale) => new DotScreenNode(nodeObject(node), angle, scale);
