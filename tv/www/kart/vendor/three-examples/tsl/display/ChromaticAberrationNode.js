import { TempNode } from "three/webgpu";
import {
  nodeObject,
  Fn,
  convertToTexture,
  float,
  vec4,
  uv
} from "three/tsl";
class ChromaticAberrationNode extends TempNode {
  static get type() {
    return "ChromaticAberrationNode";
  }
  /**
   * Constructs a new chromatic aberration node.
   *
   * @param {TextureNode} textureNode - The texture node that represents the input of the effect.
   * @param {Node} strengthNode - The strength of the chromatic aberration effect as a node.
   * @param {Node} centerNode - The center point of the effect as a node.
   * @param {Node} scaleNode - The scale factor for stepped scaling from center as a node.
   */
  constructor(textureNode, strengthNode, centerNode, scaleNode) {
    super("vec4");
    this.textureNode = textureNode;
    this.strengthNode = strengthNode;
    this.centerNode = centerNode;
    this.scaleNode = scaleNode;
  }
  /**
   * This method is used to setup the effect's TSL code.
   *
   * @param {NodeBuilder} builder - The current node builder.
   * @return {ShaderCallNodeInternal}
   */
  setup() {
    const textureNode = this.textureNode;
    const uvNode = textureNode.uvNode || uv();
    const ApplyChromaticAberration = Fn(([uv2, strength, center, scale]) => {
      const offset = uv2.sub(center);
      const distance = offset.length();
      const redScale = float(1).add(scale.mul(0.02).mul(strength));
      const greenScale = float(1);
      const blueScale = float(1).sub(scale.mul(0.02).mul(strength));
      const aberrationStrength = strength.mul(distance);
      const redUV = center.add(offset.mul(redScale));
      const greenUV = center.add(offset.mul(greenScale));
      const blueUV = center.add(offset.mul(blueScale));
      const rOffset = offset.mul(aberrationStrength).mul(float(0.01));
      const gOffset = offset.mul(aberrationStrength).mul(float(0));
      const bOffset = offset.mul(aberrationStrength).mul(float(-0.01));
      const finalRedUV = redUV.add(rOffset);
      const finalGreenUV = greenUV.add(gOffset);
      const finalBlueUV = blueUV.add(bOffset);
      const r = textureNode.sample(finalRedUV).r;
      const g = textureNode.sample(finalGreenUV).g;
      const b = textureNode.sample(finalBlueUV).b;
      const a = textureNode.sample(uv2).a;
      return vec4(r, g, b, a);
    }).setLayout({
      name: "ChromaticAberrationShader",
      type: "vec4",
      inputs: [
        { name: "uv", type: "vec2" },
        { name: "strength", type: "float" },
        { name: "center", type: "vec2" },
        { name: "scale", type: "float" }
      ]
    });
    const chromaticAberrationFn = Fn(() => {
      return ApplyChromaticAberration(
        uvNode,
        this.strengthNode,
        this.centerNode,
        this.scaleNode
      );
    });
    const outputNode = chromaticAberrationFn();
    return outputNode;
  }
}
export default ChromaticAberrationNode;
export const chromaticAberration = (node, strength = 1, center = null, scale = 1.1) => {
  return nodeObject(
    new ChromaticAberrationNode(
      convertToTexture(node),
      nodeObject(strength),
      nodeObject(center),
      nodeObject(scale)
    )
  );
};
