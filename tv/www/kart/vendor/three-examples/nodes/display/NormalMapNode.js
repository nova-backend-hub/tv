import TempNode from "../core/TempNode.js";
import { add } from "../math/OperatorNode.js";
import { bitangentView } from "../accessors/BitangentNode.js";
import { modelNormalMatrix } from "../accessors/ModelNode.js";
import { normalView } from "../accessors/NormalNode.js";
import { positionView } from "../accessors/PositionNode.js";
import { tangentView } from "../accessors/TangentNode.js";
import { uv } from "../accessors/UVNode.js";
import { faceDirection } from "./FrontFacingNode.js";
import { addNodeClass } from "../core/Node.js";
import { addNodeElement, tslFn, nodeProxy, vec3, mat3 } from "../shadernode/ShaderNode.js";
import { TangentSpaceNormalMap, ObjectSpaceNormalMap } from "three";
const perturbNormal2Arb = tslFn((inputs) => {
  const { eye_pos, surf_norm, mapN, uv: uv2 } = inputs;
  const q0 = eye_pos.dFdx();
  const q1 = eye_pos.dFdy();
  const st0 = uv2.dFdx();
  const st1 = uv2.dFdy();
  const N = surf_norm;
  const q1perp = q1.cross(N);
  const q0perp = N.cross(q0);
  const T = q1perp.mul(st0.x).add(q0perp.mul(st1.x));
  const B = q1perp.mul(st0.y).add(q0perp.mul(st1.y));
  const det = T.dot(T).max(B.dot(B));
  const scale = faceDirection.mul(det.inverseSqrt());
  return add(T.mul(mapN.x, scale), B.mul(mapN.y, scale), N.mul(mapN.z)).normalize();
});
class NormalMapNode extends TempNode {
  constructor(node, scaleNode = null) {
    super("vec3");
    this.node = node;
    this.scaleNode = scaleNode;
    this.normalMapType = TangentSpaceNormalMap;
  }
  setup(builder) {
    const { normalMapType, scaleNode } = this;
    let normalMap2 = this.node.mul(2).sub(1);
    if (scaleNode !== null) {
      normalMap2 = vec3(normalMap2.xy.mul(scaleNode), normalMap2.z);
    }
    let outputNode = null;
    if (normalMapType === ObjectSpaceNormalMap) {
      outputNode = modelNormalMatrix.mul(normalMap2).normalize();
    } else if (normalMapType === TangentSpaceNormalMap) {
      const tangent = builder.hasGeometryAttribute("tangent");
      if (tangent === true) {
        outputNode = TBNViewMatrix.mul(normalMap2).normalize();
      } else {
        outputNode = perturbNormal2Arb({
          eye_pos: positionView,
          surf_norm: normalView,
          mapN: normalMap2,
          uv: uv()
        });
      }
    }
    return outputNode;
  }
}
export default NormalMapNode;
export const normalMap = nodeProxy(NormalMapNode);
export const TBNViewMatrix = mat3(tangentView, bitangentView, normalView);
addNodeElement("normalMap", normalMap);
addNodeClass("NormalMapNode", NormalMapNode);
