import Node, { addNodeClass } from "../core/Node.js";
import { addNodeElement, nodeProxy } from "../shadernode/ShaderNode.js";
class HashNode extends Node {
  constructor(seedNode) {
    super();
    this.seedNode = seedNode;
  }
  setup() {
    const state = this.seedNode.uint().mul(747796405).add(2891336453);
    const word = state.shiftRight(state.shiftRight(28).add(4)).bitXor(state).mul(277803737);
    const result = word.shiftRight(22).bitXor(word);
    return result.float().mul(1 / 2 ** 32);
  }
}
export default HashNode;
export const hash = nodeProxy(HashNode);
addNodeElement("hash", hash);
addNodeClass("HashNode", HashNode);
