import { TempNode } from "three/webgpu";
import { rand, Fn, fract, time, uv, clamp, mix, vec4, nodeProxy } from "three/tsl";
class FilmNode extends TempNode {
  static get type() {
    return "FilmNode";
  }
  /**
   * Constructs a new film node.
   *
   * @param {Node} inputNode - The node that represents the input of the effect.
   * @param {?Node<float>} [intensityNode=null] - A node that represents the effect's intensity.
   * @param {?Node<vec2>} [uvNode=null] - A node that allows to pass custom (e.g. animated) uv data.
   */
  constructor(inputNode, intensityNode = null, uvNode = null) {
    super("vec4");
    this.inputNode = inputNode;
    this.intensityNode = intensityNode;
    this.uvNode = uvNode;
  }
  /**
   * This method is used to setup the effect's TSL code.
   *
   * @param {NodeBuilder} builder - The current node builder.
   * @return {ShaderCallNodeInternal}
   */
  setup() {
    const uvNode = this.uvNode || uv();
    const film2 = Fn(() => {
      const base = this.inputNode.rgb;
      const noise = rand(fract(uvNode.add(time)));
      let color = base.add(base.mul(clamp(noise.add(0.1), 0, 1)));
      if (this.intensityNode !== null) {
        color = mix(base, color, this.intensityNode);
      }
      return vec4(color, this.inputNode.a);
    });
    const outputNode = film2();
    return outputNode;
  }
}
export default FilmNode;
export const film = /* @__PURE__ */ nodeProxy(FilmNode);
