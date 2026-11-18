import ReferenceNode from "./ReferenceNode.js";
import { addNodeClass } from "../core/Node.js";
import { nodeObject } from "../shadernode/ShaderNode.js";
class UserDataNode extends ReferenceNode {
  constructor(property, inputType, userData2 = null) {
    super(property, inputType, userData2);
    this.userData = userData2;
  }
  update(frame) {
    this.reference = this.userData !== null ? this.userData : frame.object.userData;
    super.update(frame);
  }
}
export default UserDataNode;
export const userData = (name, inputType, userData2) => nodeObject(new UserDataNode(name, inputType, userData2));
addNodeClass("UserDataNode", UserDataNode);
