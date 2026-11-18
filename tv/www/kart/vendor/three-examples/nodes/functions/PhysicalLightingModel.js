import BRDF_Lambert from "./BSDF/BRDF_Lambert.js";
import BRDF_GGX from "./BSDF/BRDF_GGX.js";
import DFGApprox from "./BSDF/DFGApprox.js";
import EnvironmentBRDF from "./BSDF/EnvironmentBRDF.js";
import F_Schlick from "./BSDF/F_Schlick.js";
import Schlick_to_F0 from "./BSDF/Schlick_to_F0.js";
import BRDF_Sheen from "./BSDF/BRDF_Sheen.js";
import LightingModel from "../core/LightingModel.js";
import { diffuseColor, specularColor, roughness, clearcoat, clearcoatRoughness, sheen, sheenRoughness, iridescence, iridescenceIOR, iridescenceThickness } from "../core/PropertyNode.js";
import { transformedNormalView, transformedClearcoatNormalView } from "../accessors/NormalNode.js";
import { positionViewDirection } from "../accessors/PositionNode.js";
import { tslFn, float, vec3, mat3 } from "../shadernode/ShaderNode.js";
import { cond } from "../math/CondNode.js";
import { mix, smoothstep } from "../math/MathNode.js";
const XYZ_TO_REC709 = mat3(
  3.2404542,
  -0.969266,
  0.0556434,
  -1.5371385,
  1.8760108,
  -0.2040259,
  -0.4985314,
  0.041556,
  1.0572252
);
const Fresnel0ToIor = (fresnel0) => {
  const sqrtF0 = fresnel0.sqrt();
  return vec3(1).add(sqrtF0).div(vec3(1).sub(sqrtF0));
};
const IorToFresnel0 = (transmittedIor, incidentIor) => {
  return transmittedIor.sub(incidentIor).div(transmittedIor.add(incidentIor)).pow2();
};
const evalSensitivity = (OPD, shift) => {
  const phase = OPD.mul(2 * Math.PI * 1e-9);
  const val = vec3(54856e-17, 44201e-17, 52481e-17);
  const pos = vec3(1681e3, 1795300, 2208400);
  const VAR = vec3(43278e5, 93046e5, 66121e5);
  const x = float(9747e-17 * Math.sqrt(2 * Math.PI * 45282e5)).mul(phase.mul(2239900).add(shift.x).cos()).mul(phase.pow2().mul(-45282e5).exp());
  let xyz = val.mul(VAR.mul(2 * Math.PI).sqrt()).mul(pos.mul(phase).add(shift).cos()).mul(phase.pow2().negate().mul(VAR).exp());
  xyz = vec3(xyz.x.add(x), xyz.y, xyz.z).div(10685e-11);
  const rgb = XYZ_TO_REC709.mul(xyz);
  return rgb;
};
const evalIridescence = tslFn(({ outsideIOR, eta2, cosTheta1, thinFilmThickness, baseF0 }) => {
  const iridescenceIOR2 = mix(outsideIOR, eta2, smoothstep(0, 0.03, thinFilmThickness));
  const sinTheta2Sq = outsideIOR.div(iridescenceIOR2).pow2().mul(float(1).sub(cosTheta1.pow2()));
  const cosTheta2Sq = float(1).sub(sinTheta2Sq);
  const cosTheta2 = cosTheta2Sq.sqrt();
  const R0 = IorToFresnel0(iridescenceIOR2, outsideIOR);
  const R12 = F_Schlick({ f0: R0, f90: 1, dotVH: cosTheta1 });
  const T121 = R12.oneMinus();
  const phi12 = iridescenceIOR2.lessThan(outsideIOR).cond(Math.PI, 0);
  const phi21 = float(Math.PI).sub(phi12);
  const baseIOR = Fresnel0ToIor(baseF0.clamp(0, 0.9999));
  const R1 = IorToFresnel0(baseIOR, iridescenceIOR2.vec3());
  const R23 = F_Schlick({ f0: R1, f90: 1, dotVH: cosTheta2 });
  const phi23 = vec3(
    baseIOR.x.lessThan(iridescenceIOR2).cond(Math.PI, 0),
    baseIOR.y.lessThan(iridescenceIOR2).cond(Math.PI, 0),
    baseIOR.z.lessThan(iridescenceIOR2).cond(Math.PI, 0)
  );
  const OPD = iridescenceIOR2.mul(thinFilmThickness, cosTheta2, 2);
  const phi = vec3(phi21).add(phi23);
  const R123 = R12.mul(R23).clamp(1e-5, 0.9999);
  const r123 = R123.sqrt();
  const Rs = T121.pow2().mul(R23).div(vec3(1).sub(R123));
  const C0 = R12.add(Rs);
  let I = C0;
  let Cm = Rs.sub(T121);
  for (let m = 1; m <= 2; ++m) {
    Cm = Cm.mul(r123);
    const Sm = evalSensitivity(float(m).mul(OPD), float(m).mul(phi)).mul(2);
    I = I.add(Cm.mul(Sm));
  }
  return I.max(vec3(0));
}).setLayout({
  name: "evalIridescence",
  type: "vec3",
  inputs: [
    { name: "outsideIOR", type: "float" },
    { name: "eta2", type: "float" },
    { name: "cosTheta1", type: "float" },
    { name: "thinFilmThickness", type: "float" },
    { name: "baseF0", type: "vec3" }
  ]
});
const IBLSheenBRDF = tslFn(({ normal, viewDir, roughness: roughness2 }) => {
  const dotNV = normal.dot(viewDir).saturate();
  const r2 = roughness2.pow2();
  const a = cond(
    roughness2.lessThan(0.25),
    float(-339.2).mul(r2).add(float(161.4).mul(roughness2)).sub(25.9),
    float(-8.48).mul(r2).add(float(14.3).mul(roughness2)).sub(9.95)
  );
  const b = cond(
    roughness2.lessThan(0.25),
    float(44).mul(r2).sub(float(23.7).mul(roughness2)).add(3.26),
    float(1.97).mul(r2).sub(float(3.27).mul(roughness2)).add(0.72)
  );
  const DG = cond(roughness2.lessThan(0.25), 0, float(0.1).mul(roughness2).sub(0.025)).add(a.mul(dotNV).add(b).exp());
  return DG.mul(1 / Math.PI).saturate();
});
const clearcoatF0 = vec3(0.04);
const clearcoatF90 = vec3(1);
class PhysicalLightingModel extends LightingModel {
  constructor(clearcoat2 = false, sheen2 = false, iridescence2 = false) {
    super();
    this.clearcoat = clearcoat2;
    this.sheen = sheen2;
    this.iridescence = iridescence2;
    this.clearcoatRadiance = null;
    this.clearcoatSpecularDirect = null;
    this.clearcoatSpecularIndirect = null;
    this.sheenSpecularDirect = null;
    this.sheenSpecularIndirect = null;
    this.iridescenceFresnel = null;
    this.iridescenceF0 = null;
  }
  start() {
    if (this.clearcoat === true) {
      this.clearcoatRadiance = vec3().temp("clearcoatRadiance");
      this.clearcoatSpecularDirect = vec3().temp("clearcoatSpecularDirect");
      this.clearcoatSpecularIndirect = vec3().temp("clearcoatSpecularIndirect");
    }
    if (this.sheen === true) {
      this.sheenSpecularDirect = vec3().temp("sheenSpecularDirect");
      this.sheenSpecularIndirect = vec3().temp("sheenSpecularIndirect");
    }
    if (this.iridescence === true) {
      const dotNVi = transformedNormalView.dot(positionViewDirection).clamp();
      this.iridescenceFresnel = evalIridescence({
        outsideIOR: float(1),
        eta2: iridescenceIOR,
        cosTheta1: dotNVi,
        thinFilmThickness: iridescenceThickness,
        baseF0: specularColor
      });
      this.iridescenceF0 = Schlick_to_F0({ f: this.iridescenceFresnel, f90: 1, dotVH: dotNVi });
    }
  }
  // Fdez-Agüera's "Multiple-Scattering Microfacet Model for Real-Time Image Based Lighting"
  // Approximates multiscattering in order to preserve energy.
  // http://www.jcgt.org/published/0008/01/03/
  computeMultiscattering(singleScatter, multiScatter, specularF90 = float(1)) {
    const dotNV = transformedNormalView.dot(positionViewDirection).clamp();
    const fab = DFGApprox({ roughness, dotNV });
    const Fr = this.iridescenceF0 ? iridescence.mix(specularColor, this.iridescenceF0) : specularColor;
    const FssEss = Fr.mul(fab.x).add(specularF90.mul(fab.y));
    const Ess = fab.x.add(fab.y);
    const Ems = Ess.oneMinus();
    const Favg = specularColor.add(specularColor.oneMinus().mul(0.047619));
    const Fms = FssEss.mul(Favg).div(Ems.mul(Favg).oneMinus());
    singleScatter.addAssign(FssEss);
    multiScatter.addAssign(Fms.mul(Ems));
  }
  direct({ lightDirection, lightColor, reflectedLight }) {
    const dotNL = transformedNormalView.dot(lightDirection).clamp();
    const irradiance = dotNL.mul(lightColor);
    if (this.sheen === true) {
      this.sheenSpecularDirect.addAssign(irradiance.mul(BRDF_Sheen({ lightDirection })));
    }
    if (this.clearcoat === true) {
      const dotNLcc = transformedClearcoatNormalView.dot(lightDirection).clamp();
      const ccIrradiance = dotNLcc.mul(lightColor);
      this.clearcoatSpecularDirect.addAssign(ccIrradiance.mul(BRDF_GGX({ lightDirection, f0: clearcoatF0, f90: clearcoatF90, roughness: clearcoatRoughness, normalView: transformedClearcoatNormalView })));
    }
    reflectedLight.directDiffuse.addAssign(irradiance.mul(BRDF_Lambert({ diffuseColor: diffuseColor.rgb })));
    reflectedLight.directSpecular.addAssign(irradiance.mul(BRDF_GGX({ lightDirection, f0: specularColor, f90: 1, roughness, iridescence: this.iridescence, iridescenceFresnel: this.iridescenceFresnel })));
  }
  indirectDiffuse({ irradiance, reflectedLight }) {
    reflectedLight.indirectDiffuse.addAssign(irradiance.mul(BRDF_Lambert({ diffuseColor })));
  }
  indirectSpecular({ radiance, iblIrradiance, reflectedLight }) {
    if (this.sheen === true) {
      this.sheenSpecularIndirect.addAssign(iblIrradiance.mul(
        sheen,
        IBLSheenBRDF({
          normal: transformedNormalView,
          viewDir: positionViewDirection,
          roughness: sheenRoughness
        })
      ));
    }
    if (this.clearcoat === true) {
      const dotNVcc = transformedClearcoatNormalView.dot(positionViewDirection).clamp();
      const clearcoatEnv = EnvironmentBRDF({
        dotNV: dotNVcc,
        specularColor: clearcoatF0,
        specularF90: clearcoatF90,
        roughness: clearcoatRoughness
      });
      this.clearcoatSpecularIndirect.addAssign(this.clearcoatRadiance.mul(clearcoatEnv));
    }
    const singleScattering = vec3().temp("singleScattering");
    const multiScattering = vec3().temp("multiScattering");
    const cosineWeightedIrradiance = iblIrradiance.mul(1 / Math.PI);
    this.computeMultiscattering(singleScattering, multiScattering);
    const totalScattering = singleScattering.add(multiScattering);
    const diffuse = diffuseColor.mul(totalScattering.r.max(totalScattering.g).max(totalScattering.b).oneMinus());
    reflectedLight.indirectSpecular.addAssign(radiance.mul(singleScattering));
    reflectedLight.indirectSpecular.addAssign(multiScattering.mul(cosineWeightedIrradiance));
    reflectedLight.indirectDiffuse.addAssign(diffuse.mul(cosineWeightedIrradiance));
  }
  ambientOcclusion({ ambientOcclusion, reflectedLight }) {
    const dotNV = transformedNormalView.dot(positionViewDirection).clamp();
    const aoNV = dotNV.add(ambientOcclusion);
    const aoExp = roughness.mul(-16).oneMinus().negate().exp2();
    const aoNode = ambientOcclusion.sub(aoNV.pow(aoExp).oneMinus()).clamp();
    if (this.clearcoat === true) {
      this.clearcoatSpecularIndirect.mulAssign(ambientOcclusion);
    }
    if (this.sheen === true) {
      this.sheenSpecularIndirect.mulAssign(ambientOcclusion);
    }
    reflectedLight.indirectDiffuse.mulAssign(ambientOcclusion);
    reflectedLight.indirectSpecular.mulAssign(aoNode);
  }
  finish(context) {
    const { outgoingLight } = context;
    if (this.clearcoat === true) {
      const dotNVcc = transformedClearcoatNormalView.dot(positionViewDirection).clamp();
      const Fcc = F_Schlick({
        dotVH: dotNVcc,
        f0: clearcoatF0,
        f90: clearcoatF90
      });
      const clearcoatLight = outgoingLight.mul(clearcoat.mul(Fcc).oneMinus()).add(this.clearcoatSpecularDirect.add(this.clearcoatSpecularIndirect).mul(clearcoat));
      outgoingLight.assign(clearcoatLight);
    }
    if (this.sheen === true) {
      const sheenEnergyComp = sheen.r.max(sheen.g).max(sheen.b).mul(0.157).oneMinus();
      const sheenLight = outgoingLight.mul(sheenEnergyComp).add(this.sheenSpecularDirect, this.sheenSpecularIndirect);
      outgoingLight.assign(sheenLight);
    }
  }
}
export default PhysicalLightingModel;
