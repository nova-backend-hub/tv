import { tslFn } from "../../shadernode/ShaderNode.js";
const D_GGX = tslFn(({ alpha, dotNH }) => {
  const a2 = alpha.pow2();
  const denom = dotNH.pow2().mul(a2.oneMinus()).oneMinus();
  return a2.div(denom.pow2()).mul(1 / Math.PI);
}).setLayout({
  name: "D_GGX",
  type: "float",
  inputs: [
    { name: "alpha", type: "float" },
    { name: "dotNH", type: "float" }
  ]
});
export default D_GGX;
