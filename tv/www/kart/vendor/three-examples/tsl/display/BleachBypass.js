import { float, Fn, vec3, vec4, min, max, mix, luminance } from "three/tsl";
export const bleach = /* @__PURE__ */ Fn(([color, opacity = 1]) => {
  const base = color;
  const lum = luminance(base.rgb);
  const blend = vec3(lum);
  const L = min(1, max(0, float(10).mul(lum.sub(0.45))));
  const result1 = blend.mul(base.rgb).mul(2);
  const result2 = float(2).mul(blend.oneMinus()).mul(base.rgb.oneMinus()).oneMinus();
  const newColor = mix(result1, result2, L);
  const A2 = base.a.mul(opacity);
  const mixRGB = A2.mul(newColor.rgb);
  mixRGB.addAssign(base.rgb.mul(A2.oneMinus()));
  return vec4(mixRGB, base.a);
});
