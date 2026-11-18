import { TempNode } from "three/webgpu";
import { nodeObject, Fn, float, uniform, vec3, vec4, mix } from "three/tsl";
class Lut3DNode extends TempNode {
  static get type() {
    return "Lut3DNode";
  }
  /**
   * Constructs a new LUT node.
   *
   * @param {Node} inputNode - The node that represents the input of the effect.
   * @param {TextureNode} lutNode - A texture node that represents the lookup table.
   * @param {number} size - The size of the lookup table.
   * @param {Node<float>} intensityNode - Controls the intensity of the effect.
   */
  constructor(inputNode, lutNode, size, intensityNode) {
    super("vec4");
    this.inputNode = inputNode;
    this.lutNode = lutNode;
    this.size = uniform(size);
    this.intensityNode = intensityNode;
  }
  /**
   * This method is used to setup the effect's TSL code.
   *
   * @param {NodeBuilder} builder - The current node builder.
   * @return {ShaderCallNodeInternal}
   */
  setup() {
    const { inputNode, lutNode } = this;
    const sampleLut = (uv) => lutNode.sample(uv);
    const lut3D2 = Fn(() => {
      const base = inputNode;
      const pixelWidth = float(1).div(this.size);
      const halfPixelWidth = float(0.5).div(this.size);
      const uvw = vec3(halfPixelWidth).add(base.rgb.mul(float(1).sub(pixelWidth)));
      const lutValue = vec4(sampleLut(uvw).rgb, base.a);
      return vec4(mix(base, lutValue, this.intensityNode));
    });
    const outputNode = lut3D2();
    return outputNode;
  }
}
export default Lut3DNode;
export const lut3D = (node, lut, size, intensity) => new Lut3DNode(nodeObject(node), nodeObject(lut), size, nodeObject(intensity));
