import TempNode from "../core/TempNode.js";
import { uv } from "../accessors/UVNode.js";
import { addNodeClass } from "../core/Node.js";
import { addNodeElement, tslFn, nodeProxy } from "../shadernode/ShaderNode.js";
const checkerShaderNode = tslFn((inputs) => {
  const uv2 = inputs.uv.mul(2);
  const cx = uv2.x.floor();
  const cy = uv2.y.floor();
  const result = cx.add(cy).mod(2);
  return result.sign();
});
class CheckerNode extends TempNode {
  constructor(uvNode = uv()) {
    super("float");
    this.uvNode = uvNode;
  }
  setup() {
    return checkerShaderNode({ uv: this.uvNode });
  }
}
export default CheckerNode;
export const checker = nodeProxy(CheckerNode);
addNodeElement("checker", checker);
addNodeClass("CheckerNode", CheckerNode);
