import { Fn, If, PI, clamp, cos, cross, dot, equirectUV, float, log, max, mix, normalize, pow, reflect, sin, sqrt, struct, vec3 } from "three/tsl";
export const ENV_RAY_LENGTH = 1e4;
export const ENV_RAY_LENGTH_THRESHOLD = 1e3;
const SampleGGXVNDF = Fn(([V, ax, ay, r1, r2]) => {
  const wiStd = normalize(vec3(ax.mul(V.x), ay.mul(V.y), V.z)).toVar();
  const a = ax.min(ay).toVar();
  const s = float(1).add(V.xy.length()).toVar();
  const a2 = a.mul(a).toVar();
  const s2 = s.mul(s).toVar();
  const k = a2.oneMinus().mul(s2).div(s2.add(a2.mul(V.z).mul(V.z))).toVar();
  const b = wiStd.z.mul(k).toVar();
  const phi = float(6.283185307179586).mul(r1).toVar();
  const z = r2.oneMinus().mul(float(1).add(b)).sub(b).toVar();
  const sinTheta = sqrt(max(float(0), float(1).sub(z.mul(z)))).toVar();
  const c = vec3(sinTheta.mul(cos(phi)), sinTheta.mul(sin(phi)), z).toVar();
  const wmStd = c.add(wiStd).toVar();
  const Ne = normalize(vec3(
    ax.mul(wmStd.x),
    ay.mul(wmStd.y),
    max(float(0), wmStd.z)
  )).toVar();
  return Ne;
}, {
  name: "SampleGGXVNDF",
  type: "vec3",
  inputs: [
    { name: "V", type: "vec3" },
    { name: "ax", type: "float" },
    { name: "ay", type: "float" },
    { name: "r1", type: "float" },
    { name: "r2", type: "float" }
  ]
});
export const D_GTR = Fn(([roughness, NoH, k]) => {
  const a2 = roughness.mul(roughness).toVar();
  const NoH2 = NoH.mul(NoH).toVar();
  const base = NoH2.mul(a2.sub(float(1))).add(float(1)).toVar();
  return a2.div(PI.mul(pow(base, k))).toVar();
});
export const SmithG = Fn(([NDotX, alpha]) => {
  const a2 = alpha.mul(alpha).toVar();
  const NDotX2 = NDotX.mul(NDotX).toVar();
  return float(2).mul(NDotX).div(
    NDotX.add(sqrt(
      a2.add(a2.oneMinus().mul(NDotX2))
    ))
  );
});
export const GeometryTerm = Fn(([NoL, NoV, alphaG]) => {
  const G1v = SmithG(NoV, alphaG).toVar();
  const G1l = SmithG(NoL, alphaG).toVar();
  return G1v.mul(G1l).toVar();
});
const GGXVNDFPdf = Fn(([NoH, NoV, roughness]) => {
  const D = D_GTR(roughness, NoH, float(2)).toVar();
  const a2 = roughness.mul(roughness).toVar();
  const sinV2 = max(float(0), float(1).sub(NoV.mul(NoV))).toVar();
  const s = float(1).add(sqrt(sinV2)).toVar();
  const s2 = s.mul(s).toVar();
  const k = float(1).sub(a2).mul(s2).div(s2.add(a2.mul(NoV).mul(NoV))).toVar();
  const t = sqrt(a2.mul(sinV2).add(NoV.mul(NoV))).toVar();
  return D.div(max(float(1e-6), float(2).mul(k.mul(NoV).add(t)))).toVar();
});
export const F_Schlick = Fn(([f0, theta]) => {
  const oneMinus = float(1).sub(theta).toVar();
  const oneMinus2 = oneMinus.mul(oneMinus).toVar();
  const oneMinus5 = oneMinus2.mul(oneMinus2).mul(oneMinus).toVar();
  return f0.add(vec3(1).sub(f0).mul(oneMinus5)).toVar();
});
export const getSpecularDominantFactor = Fn(([NoV, roughness]) => {
  const a = float(0.298475).mul(
    log(float(39.4115).sub(float(39.0029).mul(roughness)))
  );
  const f = float(1).sub(NoV).pow(10.8649).mul(float(1).sub(a)).add(a);
  return clamp(f);
}).setLayout({
  name: "getSpecularDominantFactor",
  type: "float",
  inputs: [
    { name: "NoV", type: "float" },
    { name: "roughness", type: "float" }
  ]
});
const ggxReflectionStruct = struct({
  reflectDir: "vec3",
  // view-space reflected ray direction
  sampleWeight: "vec3",
  // chromatic weight (incl. Fresnel tint) to multiply gathered radiance by
  pdf: "float",
  // VNDF direction pdf (for MIS against the env CDF)
  NdotV: "float",
  alpha: "float",
  // GGX alpha (roughness²), clamped
  f0: "vec3"
  // Fresnel reflectance at normal incidence
});
export const ggxReflectionSample = Fn(([N, V, roughness, metalness, albedo, Xi]) => {
  const a = roughness.mul(roughness).max(1e-3).toVar();
  const ax = a.toVar();
  const ay = a.toVar();
  const up = vec3(0, 0, 1);
  let T = cross(up, N).toVar();
  T = T.normalize().toVar();
  If(T.length().lessThan(1e-3), () => {
    T.assign(cross(vec3(0, 1, 0), N).normalize());
  });
  const B = cross(N, T).normalize().toVar();
  const Vlocal = vec3(dot(T, V), dot(B, V), dot(N, V)).toVar();
  const Hlocal = SampleGGXVNDF(Vlocal, ax, ay, Xi.x, Xi.y).toVar();
  If(Hlocal.z.lessThan(0), () => {
    Hlocal.assign(Hlocal.negate());
  });
  const h = normalize(T.mul(Hlocal.x).add(B.mul(Hlocal.y)).add(N.mul(Hlocal.z))).toVar();
  const viewReflectDir = reflect(V.negate(), h).normalize().toVar();
  const L = viewReflectDir.toVar();
  const H = normalize(V.add(L)).toVar();
  const NdotV = max(float(0), dot(N, V)).toVar();
  const NdotL = max(float(0), dot(N, L)).toVar();
  const NdotH = max(float(0), dot(N, H)).toVar();
  const VdotH = max(float(0), dot(V, H)).toVar();
  const f0 = mix(vec3(0.04), albedo, metalness).toVar();
  const fresnelWeight = F_Schlick(f0, VdotH).toVar();
  const pdf = GGXVNDFPdf(NdotH, NdotV, ax).toVar();
  const a2 = ax.mul(ax).toVar();
  const sinV2 = NdotV.mul(NdotV).oneMinus().max(0).toVar();
  const sB = float(1).add(sqrt(sinV2)).toVar();
  const s2B = sB.mul(sB).toVar();
  const kB = a2.oneMinus().mul(s2B).div(s2B.add(a2.mul(NdotV).mul(NdotV))).toVar();
  const tB = sqrt(a2.mul(sinV2).add(NdotV.mul(NdotV))).toVar();
  const glossyWeight = fresnelWeight.mul(GeometryTerm(NdotL, NdotV, ax)).mul(kB.mul(NdotV).add(tB)).div(float(2).mul(NdotV).max(1e-4)).toVar();
  return ggxReflectionStruct(viewReflectDir, glossyWeight, pdf, NdotV, ax, f0);
});
export const equirectUvToDir = Fn(([uvIn]) => {
  const phi = uvIn.x.mul(Math.PI * 2).sub(Math.PI);
  const lat = uvIn.y.sub(0.5).mul(Math.PI);
  const cosLat = cos(lat);
  return normalize(vec3(
    cosLat.mul(cos(phi)),
    sin(lat),
    cosLat.mul(sin(phi))
  ));
}).setLayout({
  name: "equirectUvToDir",
  type: "vec3",
  inputs: [{ name: "uv", type: "vec2" }]
});
export const equirectDirPdf = Fn(([direction]) => {
  const uvDir = equirectUV(direction);
  const sinTheta = sin(uvDir.y.mul(Math.PI));
  return sinTheta.abs().lessThan(float(1e-6)).select(
    float(0),
    float(1).div(float(2 * Math.PI * Math.PI).mul(sinTheta))
  );
}).setLayout({
  name: "equirectDirPdf",
  type: "float",
  inputs: [{ name: "direction", type: "vec3" }]
});
export const misPowerHeuristic = Fn(([pdfA, pdfB]) => {
  const pdfASq = pdfA.mul(pdfA);
  const pdfBSq = pdfB.mul(pdfB);
  return pdfASq.div(pdfASq.add(pdfBSq));
}).setLayout({
  name: "misPowerHeuristic",
  type: "float",
  inputs: [
    { name: "pdfA", type: "float" },
    { name: "pdfB", type: "float" }
  ]
});
