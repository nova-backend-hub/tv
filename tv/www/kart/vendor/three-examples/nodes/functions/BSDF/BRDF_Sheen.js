import { transformedNormalView } from "../../accessors/NormalNode.js";
import { positionViewDirection } from "../../accessors/PositionNode.js";
import { sheen, sheenRoughness } from "../../core/PropertyNode.js";
import { tslFn, float } from "../../shadernode/ShaderNode.js";
const D_Charlie = tslFn(({ roughness, dotNH }) => {
  const alpha = roughness.pow2();
  const invAlpha = float(1).div(alpha);
  const cos2h = dotNH.pow2();
  const sin2h = cos2h.oneMinus().max(78125e-7);
  return float(2).add(invAlpha).mul(sin2h.pow(invAlpha.mul(0.5))).div(2 * Math.PI);
}).setLayout({
  name: "D_Charlie",
  type: "float",
  inputs: [
    { name: "roughness", type: "float" },
    { name: "dotNH", type: "float" }
  ]
});
const V_Neubelt = tslFn(({ dotNV, dotNL }) => {
  return float(1).div(float(4).mul(dotNL.add(dotNV).sub(dotNL.mul(dotNV))));
}).setLayout({
  name: "V_Neubelt",
  type: "float",
  inputs: [
    { name: "dotNV", type: "float" },
    { name: "dotNL", type: "float" }
  ]
});
const BRDF_Sheen = tslFn(({ lightDirection }) => {
  const halfDir = lightDirection.add(positionViewDirection).normalize();
  const dotNL = transformedNormalView.dot(lightDirection).clamp();
  const dotNV = transformedNormalView.dot(positionViewDirection).clamp();
  const dotNH = transformedNormalView.dot(halfDir).clamp();
  const D = D_Charlie({ roughness: sheenRoughness, dotNH });
  const V = V_Neubelt({ dotNV, dotNL });
  return sheen.mul(D).mul(V);
});
export default BRDF_Sheen;
