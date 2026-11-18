import { Material, ShaderMaterial, NoColorSpace, LinearSRGBColorSpace } from "three";
import { getNodeChildren, getCacheKey } from "../core/NodeUtils.js";
import { attribute } from "../core/AttributeNode.js";
import { output, diffuseColor } from "../core/PropertyNode.js";
import { materialAlphaTest, materialColor, materialOpacity, materialEmissive, materialNormal } from "../accessors/MaterialNode.js";
import { modelViewProjection } from "../accessors/ModelViewProjectionNode.js";
import { transformedNormalView } from "../accessors/NormalNode.js";
import { instance } from "../accessors/InstanceNode.js";
import { positionLocal, positionView } from "../accessors/PositionNode.js";
import { skinning } from "../accessors/SkinningNode.js";
import { morph } from "../accessors/MorphNode.js";
import { texture } from "../accessors/TextureNode.js";
import { cubeTexture } from "../accessors/CubeTextureNode.js";
import { lightNodes } from "../lighting/LightsNode.js";
import { mix } from "../math/MathNode.js";
import { float, vec3, vec4 } from "../shadernode/ShaderNode.js";
import AONode from "../lighting/AONode.js";
import { lightingContext } from "../lighting/LightingContextNode.js";
import EnvironmentNode from "../lighting/EnvironmentNode.js";
import { depthPixel } from "../display/ViewportDepthNode.js";
import { cameraLogDepth } from "../accessors/CameraNode.js";
const NodeMaterials = /* @__PURE__ */ new Map();
class NodeMaterial extends ShaderMaterial {
  constructor() {
    super();
    this.isNodeMaterial = true;
    this.type = this.constructor.type;
    this.forceSinglePass = false;
    this.fog = true;
    this.lights = true;
    this.normals = true;
    this.colorSpaced = true;
    this.lightsNode = null;
    this.envNode = null;
    this.colorNode = null;
    this.normalNode = null;
    this.opacityNode = null;
    this.backdropNode = null;
    this.backdropAlphaNode = null;
    this.alphaTestNode = null;
    this.positionNode = null;
    this.depthNode = null;
    this.outputNode = null;
    this.fragmentNode = null;
    this.vertexNode = null;
  }
  customProgramCacheKey() {
    return this.type + getCacheKey(this);
  }
  build(builder) {
    this.setup(builder);
  }
  setup(builder) {
    builder.addStack();
    builder.stack.outputNode = this.vertexNode || this.setupPosition(builder);
    builder.addFlow("vertex", builder.removeStack());
    builder.addStack();
    let resultNode;
    if (this.fragmentNode === null) {
      if (this.depthWrite === true) this.setupDepth(builder);
      if (this.normals === true) this.setupNormal(builder);
      this.setupDiffuseColor(builder);
      this.setupVariants(builder);
      const outgoingLightNode = this.setupLighting(builder);
      resultNode = this.setupOutput(builder, vec4(outgoingLightNode, diffuseColor.a));
      output.assign(resultNode);
      if (this.outputNode !== null) resultNode = this.outputNode;
    } else {
      resultNode = this.setupOutput(builder, this.fragmentNode);
    }
    builder.stack.outputNode = resultNode;
    builder.addFlow("fragment", builder.removeStack());
  }
  setupDepth(builder) {
    const { renderer } = builder;
    let depthNode = this.depthNode;
    if (depthNode === null && renderer.logarithmicDepthBuffer === true) {
      const fragDepth = modelViewProjection().w.add(1);
      depthNode = fragDepth.log2().mul(cameraLogDepth).mul(0.5);
    }
    if (depthNode !== null) {
      depthPixel.assign(depthNode).append();
    }
  }
  setupPosition(builder) {
    const { object } = builder;
    const geometry = object.geometry;
    builder.addStack();
    if (geometry.morphAttributes.position || geometry.morphAttributes.normal || geometry.morphAttributes.color) {
      morph(object).append();
    }
    if (object.isSkinnedMesh === true) {
      skinning(object).append();
    }
    if (object.instanceMatrix && object.instanceMatrix.isInstancedBufferAttribute === true && builder.isAvailable("instance") === true) {
      instance(object).append();
    }
    if (this.positionNode !== null) {
      positionLocal.assign(this.positionNode);
    }
    const mvp = modelViewProjection();
    builder.context.vertex = builder.removeStack();
    builder.context.mvp = mvp;
    return mvp;
  }
  setupDiffuseColor({ geometry }) {
    let colorNode = this.colorNode ? vec4(this.colorNode) : materialColor;
    if (this.vertexColors === true && geometry.hasAttribute("color")) {
      colorNode = vec4(colorNode.xyz.mul(attribute("color", "vec3")), colorNode.a);
    }
    diffuseColor.assign(colorNode);
    const opacityNode = this.opacityNode ? float(this.opacityNode) : materialOpacity;
    diffuseColor.a.assign(diffuseColor.a.mul(opacityNode));
    if (this.alphaTestNode !== null || this.alphaTest > 0) {
      const alphaTestNode = this.alphaTestNode !== null ? float(this.alphaTestNode) : materialAlphaTest;
      diffuseColor.a.lessThanEqual(alphaTestNode).discard();
    }
  }
  setupVariants() {
  }
  setupNormal() {
    if (this.flatShading === true) {
      const normalNode = positionView.dFdx().cross(positionView.dFdy()).normalize();
      transformedNormalView.assign(normalNode);
    } else {
      const normalNode = this.normalNode ? vec3(this.normalNode) : materialNormal;
      transformedNormalView.assign(normalNode);
    }
  }
  getEnvNode(builder) {
    let node = null;
    if (this.envNode) {
      node = this.envNode;
    } else if (this.envMap) {
      node = this.envMap.isCubeTexture ? cubeTexture(this.envMap) : texture(this.envMap);
    } else if (builder.environmentNode) {
      node = builder.environmentNode;
    }
    return node;
  }
  setupLights(builder) {
    const envNode = this.getEnvNode(builder);
    const materialLightsNode = [];
    if (envNode) {
      materialLightsNode.push(new EnvironmentNode(envNode));
    }
    if (builder.material.aoMap) {
      materialLightsNode.push(new AONode(texture(builder.material.aoMap)));
    }
    let lightsNode = this.lightsNode || builder.lightsNode;
    if (materialLightsNode.length > 0) {
      lightsNode = lightNodes([...lightsNode.lightNodes, ...materialLightsNode]);
    }
    return lightsNode;
  }
  setupLightingModel() {
  }
  setupLighting(builder) {
    const { material } = builder;
    const { backdropNode, backdropAlphaNode, emissiveNode } = this;
    const lights = this.lights === true || this.lightsNode !== null;
    const lightsNode = lights ? this.setupLights(builder) : null;
    let outgoingLightNode = diffuseColor.rgb;
    if (lightsNode && lightsNode.hasLight !== false) {
      const lightingModel = this.setupLightingModel(builder);
      outgoingLightNode = lightingContext(lightsNode, lightingModel, backdropNode, backdropAlphaNode);
    } else if (backdropNode !== null) {
      outgoingLightNode = vec3(backdropAlphaNode !== null ? mix(outgoingLightNode, backdropNode, backdropAlphaNode) : backdropNode);
    }
    if (emissiveNode && emissiveNode.isNode === true || material.emissive && material.emissive.isColor === true) {
      outgoingLightNode = outgoingLightNode.add(vec3(emissiveNode ? emissiveNode : materialEmissive));
    }
    return outgoingLightNode;
  }
  setupOutput(builder, outputNode) {
    const renderer = builder.renderer;
    const toneMappingNode = builder.toneMappingNode;
    if (this.toneMapped === true && toneMappingNode) {
      outputNode = vec4(toneMappingNode.context({ color: outputNode.rgb }), outputNode.a);
    }
    if (this.fog === true) {
      const fogNode = builder.fogNode;
      if (fogNode) outputNode = vec4(fogNode.mixAssign(outputNode.rgb), outputNode.a);
    }
    if (this.colorSpaced === true) {
      const outputColorSpace = renderer.currentColorSpace;
      if (outputColorSpace !== LinearSRGBColorSpace && outputColorSpace !== NoColorSpace) {
        outputNode = outputNode.linearToColorSpace(outputColorSpace);
      }
    }
    return outputNode;
  }
  setDefaultValues(material) {
    for (const property in material) {
      const value = material[property];
      if (this[property] === void 0) {
        this[property] = value;
        if (value && value.clone) this[property] = value.clone();
      }
    }
    Object.assign(this.defines, material.defines);
    const descriptors = Object.getOwnPropertyDescriptors(material.constructor.prototype);
    for (const key in descriptors) {
      if (Object.getOwnPropertyDescriptor(this.constructor.prototype, key) === void 0 && descriptors[key].get !== void 0) {
        Object.defineProperty(this.constructor.prototype, key, descriptors[key]);
      }
    }
  }
  toJSON(meta) {
    const isRoot = meta === void 0 || typeof meta === "string";
    if (isRoot) {
      meta = {
        textures: {},
        images: {},
        nodes: {}
      };
    }
    const data = Material.prototype.toJSON.call(this, meta);
    const nodeChildren = getNodeChildren(this);
    data.inputNodes = {};
    for (const { property, childNode } of nodeChildren) {
      data.inputNodes[property] = childNode.toJSON(meta).uuid;
    }
    function extractFromCache(cache) {
      const values = [];
      for (const key in cache) {
        const data2 = cache[key];
        delete data2.metadata;
        values.push(data2);
      }
      return values;
    }
    if (isRoot) {
      const textures = extractFromCache(meta.textures);
      const images = extractFromCache(meta.images);
      const nodes = extractFromCache(meta.nodes);
      if (textures.length > 0) data.textures = textures;
      if (images.length > 0) data.images = images;
      if (nodes.length > 0) data.nodes = nodes;
    }
    return data;
  }
  copy(source) {
    this.lightsNode = source.lightsNode;
    this.envNode = source.envNode;
    this.colorNode = source.colorNode;
    this.normalNode = source.normalNode;
    this.opacityNode = source.opacityNode;
    this.backdropNode = source.backdropNode;
    this.backdropAlphaNode = source.backdropAlphaNode;
    this.alphaTestNode = source.alphaTestNode;
    this.positionNode = source.positionNode;
    this.depthNode = source.depthNode;
    this.outputNode = source.outputNode;
    this.fragmentNode = source.fragmentNode;
    this.vertexNode = source.vertexNode;
    return super.copy(source);
  }
  static fromMaterial(material) {
    if (material.isNodeMaterial === true) {
      return material;
    }
    const type = material.type.replace("Material", "NodeMaterial");
    const nodeMaterial = createNodeMaterialFromType(type);
    if (nodeMaterial === void 0) {
      throw new Error(`NodeMaterial: Material "${material.type}" is not compatible.`);
    }
    for (const key in material) {
      nodeMaterial[key] = material[key];
    }
    return nodeMaterial;
  }
}
export default NodeMaterial;
export function addNodeMaterial(type, nodeMaterial) {
  if (typeof nodeMaterial !== "function" || !type) throw new Error(`Node material ${type} is not a class`);
  if (NodeMaterials.has(type)) {
    console.warn(`Redefinition of node material ${type}`);
    return;
  }
  NodeMaterials.set(type, nodeMaterial);
  nodeMaterial.type = type;
}
export function createNodeMaterialFromType(type) {
  const Material2 = NodeMaterials.get(type);
  if (Material2 !== void 0) {
    return new Material2();
  }
}
addNodeMaterial("NodeMaterial", NodeMaterial);
