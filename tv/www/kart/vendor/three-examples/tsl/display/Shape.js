import { Fn, float, length, smoothstep, uv } from "three/tsl";
export const circle = Fn(([scale = float(1), softness = float(0.5), coord = uv()]) => {
  const centered = coord.sub(0.5);
  const dist = length(centered).mul(2);
  const outer = scale;
  const inner = scale.sub(softness.mul(scale));
  return smoothstep(outer, inner, dist);
});
