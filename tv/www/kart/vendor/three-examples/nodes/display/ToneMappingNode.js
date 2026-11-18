import TempNode from "../core/TempNode.js";
import { addNodeClass } from "../core/Node.js";
import { tslFn, nodeObject, float, mat3 } from "../shadernode/ShaderNode.js";
import { NoToneMapping, LinearToneMapping, ReinhardToneMapping, CineonToneMapping, ACESFilmicToneMapping } from "three";
const LinearToneMappingNode = tslFn(({ color, exposure }) => {
  return color.mul(exposure).clamp();
});
const ReinhardToneMappingNode = tslFn(({ color, exposure }) => {
  color = color.mul(exposure);
  return color.div(color.add(1)).clamp();
});
const OptimizedCineonToneMappingNode = tslFn(({ color, exposure }) => {
  color = color.mul(exposure);
  color = color.sub(4e-3).max(0);
  const a = color.mul(color.mul(6.2).add(0.5));
  const b = color.mul(color.mul(6.2).add(1.7)).add(0.06);
  return a.div(b).pow(2.2);
});
const RRTAndODTFit = tslFn(({ color }) => {
  const a = color.mul(color.add(0.0245786)).sub(90537e-9);
  const b = color.mul(color.add(0.432951).mul(0.983729)).add(0.238081);
  return a.div(b);
});
const ACESFilmicToneMappingNode = tslFn(({ color, exposure }) => {
  const ACESInputMat = mat3(
    0.59719,
    0.35458,
    0.04823,
    0.076,
    0.90834,
    0.01566,
    0.0284,
    0.13383,
    0.83777
  );
  const ACESOutputMat = mat3(
    1.60475,
    -0.53108,
    -0.07367,
    -0.10208,
    1.10813,
    -605e-5,
    -327e-5,
    -0.07276,
    1.07602
  );
  color = color.mul(exposure).div(0.6);
  color = ACESInputMat.mul(color);
  color = RRTAndODTFit({ color });
  color = ACESOutputMat.mul(color);
  return color.clamp();
});
const toneMappingLib = {
  [LinearToneMapping]: LinearToneMappingNode,
  [ReinhardToneMapping]: ReinhardToneMappingNode,
  [CineonToneMapping]: OptimizedCineonToneMappingNode,
  [ACESFilmicToneMapping]: ACESFilmicToneMappingNode
};
class ToneMappingNode extends TempNode {
  constructor(toneMapping2 = NoToneMapping, exposureNode = float(1), colorNode = null) {
    super("vec3");
    this.toneMapping = toneMapping2;
    this.exposureNode = exposureNode;
    this.colorNode = colorNode;
  }
  getCacheKey() {
    let cacheKey = super.getCacheKey();
    cacheKey = "{toneMapping:" + this.toneMapping + ",nodes:" + cacheKey + "}";
    return cacheKey;
  }
  setup(builder) {
    const colorNode = this.colorNode || builder.context.color;
    const toneMapping2 = this.toneMapping;
    if (toneMapping2 === NoToneMapping) return colorNode;
    const toneMappingParams = { exposure: this.exposureNode, color: colorNode };
    const toneMappingNode = toneMappingLib[toneMapping2];
    let outputNode = null;
    if (toneMappingNode) {
      outputNode = toneMappingNode(toneMappingParams);
    } else {
      console.error("ToneMappingNode: Unsupported Tone Mapping configuration.", toneMapping2);
      outputNode = colorNode;
    }
    return outputNode;
  }
}
export default ToneMappingNode;
export const toneMapping = (mapping, exposure, color) => nodeObject(new ToneMappingNode(mapping, nodeObject(exposure), nodeObject(color)));
addNodeClass("ToneMappingNode", ToneMappingNode);
