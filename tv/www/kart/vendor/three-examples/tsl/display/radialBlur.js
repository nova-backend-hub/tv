import { interleavedGradientNoise, Fn, vec2, vec4, mix, uv, Loop, premultiplyAlpha, unpremultiplyAlpha, int, float, nodeObject, convertToTexture, screenCoordinate } from "three/tsl";
export const radialBlur = /* @__PURE__ */ Fn(([textureNode, options = {}]) => {
  textureNode = convertToTexture(textureNode);
  const center = nodeObject(options.center) || vec2(0.5, 0.5);
  const weight = nodeObject(options.weight) || float(0.9);
  const decay = nodeObject(options.decay) || float(0.95);
  const count = nodeObject(options.count) || int(32);
  const exposure = nodeObject(options.exposure) || float(5);
  const premultipliedAlpha = options.premultipliedAlpha || false;
  const tap = (uv2) => {
    const sample = textureNode.sample(uv2);
    return premultipliedAlpha ? premultiplyAlpha(sample) : sample;
  };
  const sampleUv = vec2(textureNode.uvNode || uv());
  const base = tap(sampleUv).toConst();
  const blur = vec4().toVar();
  const offset = center.sub(sampleUv).div(count).toConst();
  const w = float(weight).toVar();
  const noise = interleavedGradientNoise(screenCoordinate);
  sampleUv.addAssign(offset.mul(noise));
  Loop({ start: int(0), end: int(count), type: "int", condition: "<" }, () => {
    sampleUv.addAssign(offset);
    const sample = tap(sampleUv);
    blur.addAssign(sample.mul(w));
    w.mulAssign(decay);
  });
  blur.divAssign(count);
  blur.mulAssign(exposure);
  const color = mix(blur, base.mul(2), 0.5);
  return premultipliedAlpha ? unpremultiplyAlpha(color) : color;
});
