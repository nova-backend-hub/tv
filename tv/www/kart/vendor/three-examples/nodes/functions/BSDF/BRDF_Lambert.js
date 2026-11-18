import { tslFn } from "../../shadernode/ShaderNode.js";
const BRDF_Lambert = tslFn((inputs) => {
  return inputs.diffuseColor.mul(1 / Math.PI);
});
export default BRDF_Lambert;
