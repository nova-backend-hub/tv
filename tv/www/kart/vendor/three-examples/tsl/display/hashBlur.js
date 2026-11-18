import { float, Fn, vec2, uv, sin, rand, degrees, cos, Loop, vec4, premultiplyAlpha, unpremultiplyAlpha, convertToTexture, nodeObject } from "three/tsl";
export const hashBlur = /* @__PURE__ */ Fn(([textureNode, bluramount = float(0.1), options = {}]) => {
  textureNode = convertToTexture(textureNode);
  const repeats = nodeObject(options.repeats) || float(45);
  const premultipliedAlpha = options.premultipliedAlpha || false;
  const tap = (uv2) => {
    const sample = textureNode.sample(uv2);
    return premultipliedAlpha ? premultiplyAlpha(sample) : sample;
  };
  const targetUV = textureNode.uvNode || uv();
  const blurred_image = vec4(0);
  Loop({ start: 0, end: repeats, type: "float" }, ({ i }) => {
    const q = vec2(vec2(cos(degrees(i.div(repeats).mul(360))), sin(degrees(i.div(repeats).mul(360)))).mul(rand(vec2(i, targetUV.x.add(targetUV.y))).add(bluramount)));
    const uv2 = vec2(targetUV.add(q.mul(bluramount)));
    blurred_image.addAssign(tap(uv2));
  });
  blurred_image.divAssign(repeats);
  return premultipliedAlpha ? unpremultiplyAlpha(blurred_image) : blurred_image;
});
