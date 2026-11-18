import { float, Fn, fract, int, vec2, vec4 } from "three/tsl";
export function bindAnalyticNoise(resolution, seed = 0) {
  const seedOffset = int(seed);
  const r4 = (coords) => {
    const P = 1.324717957244746;
    const t = coords.x.mul(1 / P).add(coords.y.mul(1 / P ** 2)).add(float(seed));
    return vec4(
      fract(t.mul(P).mul(1 / P)),
      fract(t.mul(P * 2).mul(1 / P ** 2)),
      fract(t.mul(P * 3).mul(0.419875421)),
      // this is not 1 / P ** 3, however this magic constant gives better noise
      fract(t.mul(P * 4).mul(1 / P ** 3))
    );
  };
  return Fn(([uvCoord, sampleIndex]) => {
    const index = int(sampleIndex).add(seedOffset);
    const noise = vec4().toVar();
    const tileSize = float(32);
    const screenPixel = uvCoord.mul(resolution).floor();
    const offset = fract(vec2(
      float(index).mul(0.7548776662),
      float(index).mul(0.569840291)
    )).mul(tileSize).floor();
    const coords = screenPixel.add(offset).mod(tileSize);
    noise.assign(r4(coords));
    return noise;
  });
}
