import {
  Color,
  Mesh,
  Vector3,
  NodeMaterial
} from "three/webgpu";
import { Fn, add, cameraPosition, div, normalize, positionWorld, sub, time, texture, vec2, max, dot, reflect, pow, length, float, uniform, reflector, mul, mix } from "three/tsl";
class WaterMesh extends Mesh {
  /**
   * Constructs a new water mesh.
   *
   * @param {BufferGeometry} geometry - The water mesh's geometry.
   * @param {WaterMesh~Options} [options] - The configuration options.
   */
  constructor(geometry, options) {
    const material = new NodeMaterial();
    super(geometry, material);
    this.isWaterMesh = true;
    this.resolutionScale = options.resolutionScale !== void 0 ? options.resolutionScale : 0.5;
    this.waterNormals = texture(options.waterNormals);
    this.alpha = uniform(options.alpha !== void 0 ? options.alpha : 1);
    this.size = uniform(options.size !== void 0 ? options.size : 1);
    this.sunColor = uniform(new Color(options.sunColor !== void 0 ? options.sunColor : 16777215));
    this.sunDirection = uniform(options.sunDirection !== void 0 ? options.sunDirection : new Vector3(0.70707, 0.70707, 0));
    this.waterColor = uniform(new Color(options.waterColor !== void 0 ? options.waterColor : 8355711));
    this.distortionScale = uniform(options.distortionScale !== void 0 ? options.distortionScale : 20);
    const getNoise = Fn(([uv]) => {
      const offset = time;
      const uv0 = add(div(uv, 103), vec2(div(offset, 17), div(offset, 29))).toVar();
      const uv1 = div(uv, 107).sub(vec2(div(offset, -19), div(offset, 31))).toVar();
      const uv2 = add(div(uv, vec2(8907, 9803)), vec2(div(offset, 101), div(offset, 97))).toVar();
      const uv3 = sub(div(uv, vec2(1091, 1027)), vec2(div(offset, 109), div(offset, -113))).toVar();
      const sample0 = this.waterNormals.sample(uv0);
      const sample1 = this.waterNormals.sample(uv1);
      const sample2 = this.waterNormals.sample(uv2);
      const sample3 = this.waterNormals.sample(uv3);
      const noise2 = sample0.add(sample1).add(sample2).add(sample3);
      return noise2.mul(0.5).sub(1);
    });
    const noise = getNoise(positionWorld.xz.mul(this.size));
    const surfaceNormal = normalize(noise.xzy.mul(1.5, 1, 1.5));
    const worldToEye = cameraPosition.sub(positionWorld);
    const eyeDirection = normalize(worldToEye);
    const reflection = normalize(reflect(this.sunDirection.negate(), surfaceNormal));
    const direction = max(0, dot(eyeDirection, reflection));
    const specularLight = pow(direction, 100).mul(this.sunColor).mul(2);
    const diffuseLight = max(dot(this.sunDirection, surfaceNormal), 0).mul(this.sunColor).mul(0.5);
    const distance = length(worldToEye);
    const distortion = surfaceNormal.xz.mul(float(1e-3).add(float(1).div(distance))).mul(this.distortionScale);
    material.transparent = true;
    material.opacityNode = this.alpha;
    material.receivedShadowPositionNode = positionWorld.add(distortion);
    material.colorNode = Fn(() => {
      const mirrorSampler = reflector();
      mirrorSampler.uvNode = mirrorSampler.uvNode.add(distortion);
      mirrorSampler.reflector.resolutionScale = this.resolutionScale;
      this.add(mirrorSampler.target);
      const theta = max(dot(eyeDirection, surfaceNormal), 0);
      const rf0 = float(0.02);
      const reflectance = mul(pow(float(1).sub(theta), 5), float(1).sub(rf0)).add(rf0);
      const scatter = max(0, dot(surfaceNormal, eyeDirection)).mul(this.waterColor);
      const albedo = mix(this.sunColor.mul(diffuseLight).mul(0.3).add(scatter), mirrorSampler.rgb.add(specularLight), reflectance);
      return albedo;
    })();
  }
}
export { WaterMesh };
