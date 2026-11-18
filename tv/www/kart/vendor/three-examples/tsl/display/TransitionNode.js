import { TempNode } from "three/webgpu";
import { nodeObject, Fn, float, uv, convertToTexture, vec4, If, int, clamp, sub, mix } from "three/tsl";
class TransitionNode extends TempNode {
  static get type() {
    return "TransitionNode";
  }
  /**
   * Constructs a new transition node.
   *
   * @param {TextureNode} textureNodeA - A texture node that represents the beauty pass of the first scene.
   * @param {TextureNode} textureNodeB - A texture node that represents the beauty pass of the second scene.
   * @param {TextureNode} mixTextureNode - A texture node that defines how the transition effect should look like.
   * @param {Node<float>} mixRatioNode - The interpolation factor that controls the mix.
   * @param {Node<float>} thresholdNode - Can be used to tweak the linear interpolation.
   * @param {Node<float>} useTextureNode - Whether `mixTextureNode` should influence the transition or not.
   */
  constructor(textureNodeA, textureNodeB, mixTextureNode, mixRatioNode, thresholdNode, useTextureNode) {
    super("vec4");
    this.textureNodeA = textureNodeA;
    this.textureNodeB = textureNodeB;
    this.mixTextureNode = mixTextureNode;
    this.mixRatioNode = mixRatioNode;
    this.thresholdNode = thresholdNode;
    this.useTextureNode = useTextureNode;
  }
  /**
   * This method is used to setup the effect's TSL code.
   *
   * @param {NodeBuilder} builder - The current node builder.
   * @return {ShaderCallNodeInternal}
   */
  setup() {
    const { textureNodeA, textureNodeB, mixTextureNode, mixRatioNode, thresholdNode, useTextureNode } = this;
    const sampleTexture = (textureNode) => {
      const uvNodeTexture = textureNode.uvNode || uv();
      return textureNode.sample(uvNodeTexture);
    };
    const transition2 = Fn(() => {
      const texelOne = sampleTexture(textureNodeA);
      const texelTwo = sampleTexture(textureNodeB);
      const color = vec4().toVar();
      If(useTextureNode.equal(int(1)), () => {
        const transitionTexel = sampleTexture(mixTextureNode);
        const r = mixRatioNode.mul(thresholdNode.mul(2).add(1)).sub(thresholdNode);
        const mixf = clamp(sub(transitionTexel.r, r).mul(float(1).div(thresholdNode)), 0, 1);
        color.assign(mix(texelOne, texelTwo, mixf));
      }).Else(() => {
        color.assign(mix(texelTwo, texelOne, mixRatioNode));
      });
      return color;
    });
    const outputNode = transition2();
    return outputNode;
  }
}
export default TransitionNode;
export const transition = (nodeA, nodeB, mixTextureNode, mixRatio, threshold, useTexture) => new TransitionNode(convertToTexture(nodeA), convertToTexture(nodeB), convertToTexture(mixTextureNode), nodeObject(mixRatio), nodeObject(threshold), nodeObject(useTexture));
