import { Fn, vec2, uv, Loop, vec4, premultiplyAlpha, unpremultiplyAlpha, max, int, textureSize, nodeObject, convertToTexture } from "three/tsl";
export const boxBlur = /* @__PURE__ */ Fn(([textureNode, options = {}]) => {
  textureNode = convertToTexture(textureNode);
  const size = nodeObject(options.size) || int(1);
  const separation = nodeObject(options.separation) || int(1);
  const premultipliedAlpha = options.premultipliedAlpha || false;
  const tap = (uv2) => {
    const sample = textureNode.sample(uv2);
    return premultipliedAlpha ? premultiplyAlpha(sample) : sample;
  };
  const targetUV = textureNode.uvNode || uv();
  const result = vec4(0);
  const sep = max(separation, 1);
  const count = int(0);
  const pixelStep = vec2(1).div(textureSize(textureNode));
  Loop({ start: size.negate(), end: size, name: "i", condition: "<=" }, ({ i }) => {
    Loop({ start: size.negate(), end: size, name: "j", condition: "<=" }, ({ j }) => {
      const uvs = targetUV.add(vec2(i, j).mul(pixelStep).mul(sep));
      result.addAssign(tap(uvs));
      count.addAssign(1);
    });
  });
  result.divAssign(count);
  return premultipliedAlpha ? unpremultiplyAlpha(result) : result;
});
