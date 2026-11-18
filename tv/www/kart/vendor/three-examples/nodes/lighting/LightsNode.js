import Node from "../core/Node.js";
import AnalyticLightNode from "./AnalyticLightNode.js";
import { nodeObject, nodeProxy, vec3 } from "../shadernode/ShaderNode.js";
const LightNodes = /* @__PURE__ */ new WeakMap();
const sortLights = (lights2) => {
  return lights2.sort((a, b) => a.id - b.id);
};
class LightsNode extends Node {
  constructor(lightNodes2 = []) {
    super("vec3");
    this.totalDiffuseNode = vec3().temp("totalDiffuse");
    this.totalSpecularNode = vec3().temp("totalSpecular");
    this.outgoingLightNode = vec3().temp("outgoingLight");
    this.lightNodes = lightNodes2;
    this._hash = null;
  }
  get hasLight() {
    return this.lightNodes.length > 0;
  }
  getHash() {
    if (this._hash === null) {
      const hash = [];
      for (const lightNode of this.lightNodes) {
        hash.push(lightNode.getHash());
      }
      this._hash = "lights-" + hash.join(",");
    }
    return this._hash;
  }
  setup(builder) {
    const context = builder.context;
    const lightingModel = context.lightingModel;
    let outgoingLightNode = this.outgoingLightNode;
    if (lightingModel) {
      const { lightNodes: lightNodes2, totalDiffuseNode, totalSpecularNode } = this;
      context.outgoingLight = outgoingLightNode;
      const stack = builder.addStack();
      lightingModel.start(context, stack, builder);
      for (const lightNode of lightNodes2) {
        lightNode.build(builder);
      }
      lightingModel.indirectDiffuse(context, stack, builder);
      lightingModel.indirectSpecular(context, stack, builder);
      lightingModel.ambientOcclusion(context, stack, builder);
      const { backdrop, backdropAlpha } = context;
      const { directDiffuse, directSpecular, indirectDiffuse, indirectSpecular } = context.reflectedLight;
      let totalDiffuse = directDiffuse.add(indirectDiffuse);
      if (backdrop !== null) {
        totalDiffuse = vec3(backdropAlpha !== null ? backdropAlpha.mix(totalDiffuse, backdrop) : backdrop);
      }
      totalDiffuseNode.assign(totalDiffuse);
      totalSpecularNode.assign(directSpecular.add(indirectSpecular));
      outgoingLightNode.assign(totalDiffuseNode.add(totalSpecularNode));
      lightingModel.finish(context, stack, builder);
      outgoingLightNode = outgoingLightNode.bypass(builder.removeStack());
    }
    return outgoingLightNode;
  }
  _getLightNodeById(id) {
    for (const lightNode of this.lightNodes) {
      if (lightNode.isAnalyticLightNode && lightNode.light.id === id) {
        return lightNode;
      }
    }
    return null;
  }
  fromLights(lights2 = []) {
    const lightNodes2 = [];
    lights2 = sortLights(lights2);
    for (const light of lights2) {
      let lightNode = this._getLightNodeById(light.id);
      if (lightNode === null) {
        const lightClass = light.constructor;
        const lightNodeClass = LightNodes.has(lightClass) ? LightNodes.get(lightClass) : AnalyticLightNode;
        lightNode = nodeObject(new lightNodeClass(light));
      }
      lightNodes2.push(lightNode);
    }
    this.lightNodes = lightNodes2;
    this._hash = null;
    return this;
  }
}
export default LightsNode;
export const lights = (lights2) => nodeObject(new LightsNode().fromLights(lights2));
export const lightNodes = nodeProxy(LightsNode);
export function addLightNode(lightClass, lightNodeClass) {
  if (LightNodes.has(lightClass)) {
    console.warn(`Redefinition of light node ${lightNodeClass.type}`);
    return;
  }
  if (typeof lightClass !== "function") throw new Error(`Light ${lightClass.name} is not a class`);
  if (typeof lightNodeClass !== "function" || !lightNodeClass.type) throw new Error(`Light node ${lightNodeClass.type} is not a class`);
  LightNodes.set(lightClass, lightNodeClass);
}
