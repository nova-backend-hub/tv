import {
  BackSide,
  BoxGeometry,
  Mesh,
  Vector3,
  NodeMaterial
} from "three/webgpu";
import { Fn, float, vec2, vec3, acos, add, mul, clamp, cos, dot, exp, max, mix, modelViewProjection, normalize, positionWorld, pow, smoothstep, sub, varyingProperty, vec4, uniform, cameraPosition, fract, floor, sin, time, Loop, If } from "three/tsl";
class SkyMesh extends Mesh {
  /**
   * Constructs a new skydome.
   */
  constructor() {
    const material = new NodeMaterial();
    super(new BoxGeometry(1, 1, 1), material);
    this.turbidity = uniform(2);
    this.rayleigh = uniform(1);
    this.mieCoefficient = uniform(5e-3);
    this.mieDirectionalG = uniform(0.8);
    this.sunPosition = uniform(new Vector3());
    this.upUniform = uniform(new Vector3(0, 1, 0));
    this.cloudScale = uniform(2e-4);
    this.cloudSpeed = uniform(1e-4);
    this.cloudCoverage = uniform(0.4);
    this.cloudDensity = uniform(0.4);
    this.cloudElevation = uniform(0.5);
    this.showSunDisc = uniform(1);
    this.isSky = true;
    this.isSkyMesh = true;
    const vSunDirection = varyingProperty("vec3");
    const vSunE = varyingProperty("float");
    const vBetaR = varyingProperty("vec3");
    const vBetaM = varyingProperty("vec3");
    const vertexNode = /* @__PURE__ */ Fn(() => {
      const e = float(2.718281828459045);
      const totalRayleigh = vec3(5804542996261093e-21, 13562911419845635e-21, 30265902468824876e-21);
      const MieConst = vec3(18399918514433978e-2, 27798023919660528e-2, 40790479543861094e-2);
      const cutoffAngle = float(1.6110731556870734);
      const steepness = float(1.5);
      const EE = float(1e3);
      const sunDirection = normalize(this.sunPosition);
      vSunDirection.assign(sunDirection);
      const angle = dot(sunDirection, this.upUniform);
      const zenithAngleCos = clamp(angle, -1, 1);
      const sunIntensity = EE.mul(max(0, float(1).sub(pow(e, cutoffAngle.sub(acos(zenithAngleCos)).div(steepness).negate()))));
      vSunE.assign(sunIntensity);
      const sunfade = float(1).sub(clamp(float(1).sub(exp(this.sunPosition.y.div(45e4))), 0, 1));
      const rayleighCoefficient = this.rayleigh.sub(float(1).mul(float(1).sub(sunfade)));
      vBetaR.assign(totalRayleigh.mul(rayleighCoefficient));
      const c = float(0.2).mul(this.turbidity).mul(1e-17);
      const totalMie = float(0.434).mul(c).mul(MieConst);
      vBetaM.assign(totalMie.mul(this.mieCoefficient));
      const position = modelViewProjection;
      position.z.assign(position.w);
      return position;
    })();
    const colorNode = /* @__PURE__ */ Fn(() => {
      const pi = float(3.141592653589793);
      const rayleighZenithLength = float(8400);
      const mieZenithLength = float(1250);
      const sunAngularDiameterCos = float(0.9999566769464484);
      const THREE_OVER_SIXTEENPI = float(0.05968310365946075);
      const ONE_OVER_FOURPI = float(0.07957747154594767);
      const direction = normalize(positionWorld.sub(cameraPosition));
      const zenithAngle = acos(max(0, dot(this.upUniform, direction)));
      const inverse = float(1).div(cos(zenithAngle).add(float(0.15).mul(pow(float(93.885).sub(zenithAngle.mul(180).div(pi)), -1.253))));
      const sR = rayleighZenithLength.mul(inverse);
      const sM = mieZenithLength.mul(inverse);
      const Fex = exp(mul(vBetaR, sR).add(mul(vBetaM, sM)).negate());
      const cosTheta = dot(direction, vSunDirection);
      const c = cosTheta.mul(0.5).add(0.5);
      const rPhase = THREE_OVER_SIXTEENPI.mul(float(1).add(pow(c, 2)));
      const betaRTheta = vBetaR.mul(rPhase);
      const g2 = pow(this.mieDirectionalG, 2);
      const inv = float(1).div(pow(float(1).sub(float(2).mul(this.mieDirectionalG).mul(cosTheta)).add(g2), 1.5));
      const mPhase = ONE_OVER_FOURPI.mul(float(1).sub(g2)).mul(inv);
      const betaMTheta = vBetaM.mul(mPhase);
      const Lin = pow(vSunE.mul(add(betaRTheta, betaMTheta).div(add(vBetaR, vBetaM))).mul(sub(1, Fex)), vec3(1.5));
      Lin.mulAssign(mix(vec3(1), pow(vSunE.mul(add(betaRTheta, betaMTheta).div(add(vBetaR, vBetaM))).mul(Fex), vec3(1 / 2)), clamp(pow(sub(1, dot(this.upUniform, vSunDirection)), 5), 0, 1)));
      const L0 = vec3(0.1).mul(Fex);
      const sundisc = smoothstep(sunAngularDiameterCos, sunAngularDiameterCos.add(2e-5), cosTheta).mul(this.showSunDisc);
      L0.addAssign(vSunE.mul(19e3).mul(Fex).mul(sundisc));
      const texColor = add(Lin, L0).mul(0.04).add(vec3(0, 3e-4, 75e-5)).toVar();
      const hash = Fn(([p]) => {
        return fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453123));
      });
      const noise = Fn(([p_immutable]) => {
        const p = vec2(p_immutable).toVar();
        const i = floor(p);
        const f = fract(p);
        const ff = f.mul(f).mul(sub(3, f.mul(2)));
        const a = hash(i);
        const b = hash(add(i, vec2(1, 0)));
        const c2 = hash(add(i, vec2(0, 1)));
        const d = hash(add(i, vec2(1, 1)));
        return mix(mix(a, b, ff.x), mix(c2, d, ff.x), ff.y);
      });
      const fbm = Fn(([p_immutable]) => {
        const p = vec2(p_immutable).toVar();
        const value = float(0).toVar();
        const amplitude = float(0.5).toVar();
        Loop(5, () => {
          value.addAssign(amplitude.mul(noise(p)));
          p.mulAssign(2);
          amplitude.mulAssign(0.5);
        });
        return value;
      });
      If(direction.y.greaterThan(0).and(this.cloudCoverage.greaterThan(0)), () => {
        const elevation = mix(1, 0.1, this.cloudElevation);
        const cloudUV = direction.xz.div(direction.y.mul(elevation)).toVar();
        cloudUV.mulAssign(this.cloudScale);
        cloudUV.addAssign(time.mul(this.cloudSpeed));
        const cloudNoise = fbm(cloudUV.mul(1e3)).add(fbm(cloudUV.mul(2e3).add(3.7)).mul(0.5)).toVar();
        cloudNoise.assign(cloudNoise.mul(0.5).add(0.5));
        const cloudMask = smoothstep(sub(1, this.cloudCoverage), sub(1, this.cloudCoverage).add(0.3), cloudNoise).toVar();
        const horizonFade = smoothstep(0, add(0.1, mul(0.2, this.cloudElevation)), direction.y);
        cloudMask.mulAssign(horizonFade);
        const sunInfluence = dot(direction, vSunDirection).mul(0.5).add(0.5);
        const daylight = max(0, vSunDirection.y.mul(2));
        const atmosphereColor = Lin.mul(0.04);
        const cloudColor = mix(vec3(0.3), vec3(1), daylight).toVar();
        cloudColor.assign(mix(cloudColor, atmosphereColor.add(vec3(1)), sunInfluence.mul(0.5)));
        cloudColor.mulAssign(vSunE.mul(2e-5));
        texColor.assign(mix(texColor, cloudColor, cloudMask.mul(this.cloudDensity)));
      });
      return vec4(texColor, 1);
    })();
    material.side = BackSide;
    material.depthWrite = false;
    material.vertexNode = vertexNode;
    material.colorNode = colorNode;
  }
}
export { SkyMesh };
