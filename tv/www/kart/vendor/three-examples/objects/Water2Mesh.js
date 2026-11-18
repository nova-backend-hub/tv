import {
  Color,
  Mesh,
  Vector2,
  Vector3,
  NodeMaterial,
  NodeUpdateType,
  TempNode
} from "three/webgpu";
import { Fn, vec2, viewportSafeUV, viewportSharedTexture, reflector, pow, float, abs, texture, uniform, vec4, cameraPosition, positionWorld, uv, mix, vec3, normalize, max, dot, screenUV } from "three/tsl";
class WaterMesh extends Mesh {
  /**
   * Constructs a new water mesh.
   *
   * @param {BufferGeometry} geometry - The water's geometry.
   * @param {module:Water2~Options} [options] - The configuration options.
   */
  constructor(geometry, options = {}) {
    const material = new NodeMaterial();
    material.transparent = true;
    super(geometry, material);
    this.isWater = true;
    material.colorNode = new WaterNode(options, this);
  }
}
class WaterNode extends TempNode {
  constructor(options, waterBody) {
    super("vec4");
    this.waterBody = waterBody;
    this.normalMap0 = texture(options.normalMap0);
    this.normalMap1 = texture(options.normalMap1);
    this.flowMap = texture(options.flowMap);
    this.color = uniform(options.color !== void 0 ? new Color(options.color) : new Color(16777215));
    this.flowDirection = uniform(options.flowDirection !== void 0 ? options.flowDirection : new Vector2(1, 0));
    this.flowSpeed = uniform(options.flowSpeed !== void 0 ? options.flowSpeed : 0.03);
    this.reflectivity = uniform(options.reflectivity !== void 0 ? options.reflectivity : 0.02);
    this.scale = uniform(options.scale !== void 0 ? options.scale : 1);
    this.flowConfig = uniform(new Vector3());
    this.updateBeforeType = NodeUpdateType.RENDER;
    this._cycle = 0.15;
    this._halfCycle = this._cycle * 0.5;
    this._USE_FLOW = options.flowMap !== void 0;
  }
  updateFlow(delta) {
    this.flowConfig.value.x += this.flowSpeed.value * delta;
    this.flowConfig.value.y = this.flowConfig.value.x + this._halfCycle;
    if (this.flowConfig.value.x >= this._cycle) {
      this.flowConfig.value.x = 0;
      this.flowConfig.value.y = this._halfCycle;
    } else if (this.flowConfig.value.y >= this._cycle) {
      this.flowConfig.value.y = this.flowConfig.value.y - this._cycle;
    }
    this.flowConfig.value.z = this._halfCycle;
  }
  updateBefore(frame) {
    this.updateFlow(frame.deltaTime);
  }
  setup() {
    const outputNode = Fn(() => {
      const flowMapOffset0 = this.flowConfig.x;
      const flowMapOffset1 = this.flowConfig.y;
      const halfCycle = this.flowConfig.z;
      const toEye = normalize(cameraPosition.sub(positionWorld));
      let flow;
      if (this._USE_FLOW === true) {
        flow = this.flowMap.rg.mul(2).sub(1);
      } else {
        flow = vec2(this.flowDirection.x, this.flowDirection.y);
      }
      flow.x.mulAssign(-1);
      const uvs = uv();
      const normalUv0 = uvs.mul(this.scale).add(flow.mul(flowMapOffset0));
      const normalUv1 = uvs.mul(this.scale).add(flow.mul(flowMapOffset1));
      const normalColor0 = this.normalMap0.sample(normalUv0);
      const normalColor1 = this.normalMap1.sample(normalUv1);
      const flowLerp = abs(halfCycle.sub(flowMapOffset0)).div(halfCycle);
      const normalColor = mix(normalColor0, normalColor1, flowLerp);
      const normal = normalize(vec3(normalColor.r.mul(2).sub(1), normalColor.b, normalColor.g.mul(2).sub(1)));
      const theta = max(dot(toEye, normal), 0);
      const reflectance = pow(float(1).sub(theta), 5).mul(float(1).sub(this.reflectivity)).add(this.reflectivity);
      const offset = normal.xz.mul(0.05).toVar();
      const reflectionSampler = reflector();
      this.waterBody.add(reflectionSampler.target);
      reflectionSampler.uvNode = reflectionSampler.uvNode.add(offset);
      const refractorUV = screenUV.add(offset);
      const refractionSampler = viewportSharedTexture(viewportSafeUV(refractorUV));
      return vec4(this.color, 1).mul(mix(refractionSampler, reflectionSampler, reflectance));
    })();
    return outputNode;
  }
}
export { WaterMesh };
