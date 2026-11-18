import LightingNode from "./LightingNode.js";
import { NodeUpdateType } from "../core/constants.js";
import { uniform } from "../core/UniformNode.js";
import { addNodeClass } from "../core/Node.js";
import { vec3 } from "../shadernode/ShaderNode.js";
import { reference } from "../accessors/ReferenceNode.js";
import { texture } from "../accessors/TextureNode.js";
import { positionWorld } from "../accessors/PositionNode.js";
import { normalWorld } from "../accessors/NormalNode.js";
import { WebGPUCoordinateSystem } from "three";
import { Color, DepthTexture, NearestFilter, LessCompare } from "three";
let depthMaterial = null;
class AnalyticLightNode extends LightingNode {
  constructor(light = null) {
    super();
    this.updateType = NodeUpdateType.FRAME;
    this.light = light;
    this.rtt = null;
    this.shadowNode = null;
    this.color = new Color();
    this._defaultColorNode = uniform(this.color);
    this.colorNode = this._defaultColorNode;
    this.isAnalyticLightNode = true;
  }
  getCacheKey() {
    return super.getCacheKey() + "-" + (this.light.id + "-" + (this.light.castShadow ? "1" : "0"));
  }
  getHash() {
    return this.light.uuid;
  }
  setupShadow(builder) {
    let shadowNode = this.shadowNode;
    if (shadowNode === null) {
      if (depthMaterial === null) depthMaterial = builder.createNodeMaterial("MeshBasicNodeMaterial");
      const shadow = this.light.shadow;
      const rtt = builder.getRenderTarget(shadow.mapSize.width, shadow.mapSize.height);
      const depthTexture = new DepthTexture();
      depthTexture.minFilter = NearestFilter;
      depthTexture.magFilter = NearestFilter;
      depthTexture.image.width = shadow.mapSize.width;
      depthTexture.image.height = shadow.mapSize.height;
      depthTexture.compareFunction = LessCompare;
      rtt.depthTexture = depthTexture;
      shadow.camera.updateProjectionMatrix();
      const bias = reference("bias", "float", shadow);
      const normalBias = reference("normalBias", "float", shadow);
      let shadowCoord = uniform(shadow.matrix).mul(positionWorld.add(normalWorld.mul(normalBias)));
      shadowCoord = shadowCoord.xyz.div(shadowCoord.w);
      const frustumTest = shadowCoord.x.greaterThanEqual(0).and(shadowCoord.x.lessThanEqual(1)).and(shadowCoord.y.greaterThanEqual(0)).and(shadowCoord.y.lessThanEqual(1)).and(shadowCoord.z.lessThanEqual(1));
      let coordZ = shadowCoord.z.add(bias);
      if (builder.renderer.coordinateSystem === WebGPUCoordinateSystem) {
        coordZ = coordZ.mul(2).sub(1);
      }
      shadowCoord = vec3(
        shadowCoord.x,
        shadowCoord.y.oneMinus(),
        // follow webgpu standards
        coordZ
      );
      const textureCompare = (depthTexture2, shadowCoord2, compare) => texture(depthTexture2, shadowCoord2).compare(compare);
      shadowNode = textureCompare(depthTexture, shadowCoord.xy, shadowCoord.z);
      this.rtt = rtt;
      this.colorNode = this.colorNode.mul(frustumTest.mix(1, shadowNode));
      this.shadowNode = shadowNode;
      this.updateBeforeType = NodeUpdateType.RENDER;
    }
  }
  setup(builder) {
    if (this.light.castShadow) this.setupShadow(builder);
    else if (this.shadowNode !== null) this.disposeShadow();
  }
  updateShadow(frame) {
    const { rtt, light } = this;
    const { renderer, scene } = frame;
    const currentOverrideMaterial = scene.overrideMaterial;
    scene.overrideMaterial = depthMaterial;
    rtt.setSize(light.shadow.mapSize.width, light.shadow.mapSize.height);
    light.shadow.updateMatrices(light);
    const currentRenderTarget = renderer.getRenderTarget();
    const currentRenderObjectFunction = renderer.getRenderObjectFunction();
    renderer.setRenderObjectFunction((object, ...params) => {
      if (object.castShadow === true) {
        renderer.renderObject(object, ...params);
      }
    });
    renderer.setRenderTarget(rtt);
    renderer.render(scene, light.shadow.camera);
    renderer.setRenderTarget(currentRenderTarget);
    renderer.setRenderObjectFunction(currentRenderObjectFunction);
    scene.overrideMaterial = currentOverrideMaterial;
  }
  disposeShadow() {
    this.rtt.dispose();
    this.shadowNode = null;
    this.rtt = null;
    this.colorNode = this._defaultColorNode;
  }
  updateBefore(frame) {
    const { light } = this;
    if (light.castShadow) this.updateShadow(frame);
  }
  update() {
    const { light } = this;
    this.color.copy(light.color).multiplyScalar(light.intensity);
  }
}
export default AnalyticLightNode;
addNodeClass("AnalyticLightNode", AnalyticLightNode);
