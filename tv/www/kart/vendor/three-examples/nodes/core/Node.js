import { EventDispatcher } from "three";
import { NodeUpdateType } from "./constants.js";
import { getNodeChildren, getCacheKey } from "./NodeUtils.js";
import { MathUtils } from "three";
const NodeClasses = /* @__PURE__ */ new Map();
let _nodeId = 0;
class Node extends EventDispatcher {
  constructor(nodeType = null) {
    super();
    this.nodeType = nodeType;
    this.updateType = NodeUpdateType.NONE;
    this.updateBeforeType = NodeUpdateType.NONE;
    this.uuid = MathUtils.generateUUID();
    this.isNode = true;
    Object.defineProperty(this, "id", { value: _nodeId++ });
  }
  get type() {
    return this.constructor.type;
  }
  getSelf() {
    return this.self || this;
  }
  updateReference() {
    return this;
  }
  isGlobal() {
    return false;
  }
  *getChildren() {
    for (const { childNode } of getNodeChildren(this)) {
      yield childNode;
    }
  }
  dispose() {
    this.dispatchEvent({ type: "dispose" });
  }
  traverse(callback) {
    callback(this);
    for (const childNode of this.getChildren()) {
      childNode.traverse(callback);
    }
  }
  getCacheKey() {
    return getCacheKey(this);
  }
  getHash() {
    return this.uuid;
  }
  getUpdateType() {
    return this.updateType;
  }
  getUpdateBeforeType() {
    return this.updateBeforeType;
  }
  getNodeType(builder) {
    const nodeProperties = builder.getNodeProperties(this);
    if (nodeProperties.outputNode) {
      return nodeProperties.outputNode.getNodeType(builder);
    }
    return this.nodeType;
  }
  getShared(builder) {
    const hash = this.getHash(builder);
    const nodeFromHash = builder.getNodeFromHash(hash);
    return nodeFromHash || this;
  }
  setup(builder) {
    const nodeProperties = builder.getNodeProperties(this);
    for (const childNode of this.getChildren()) {
      nodeProperties["_node" + childNode.id] = childNode;
    }
    return null;
  }
  construct(builder) {
    console.warn("THREE.Node: construct() is deprecated. Use setup() instead.");
    return this.setup(builder);
  }
  analyze(builder) {
    const nodeData = builder.getDataFromNode(this);
    nodeData.dependenciesCount = nodeData.dependenciesCount === void 0 ? 1 : nodeData.dependenciesCount + 1;
    if (nodeData.dependenciesCount === 1) {
      const nodeProperties = builder.getNodeProperties(this);
      for (const childNode of Object.values(nodeProperties)) {
        if (childNode && childNode.isNode === true) {
          childNode.build(builder);
        }
      }
    }
  }
  generate(builder, output) {
    const { outputNode } = builder.getNodeProperties(this);
    if (outputNode && outputNode.isNode === true) {
      return outputNode.build(builder, output);
    }
  }
  updateBefore() {
    console.warn("Abstract function.");
  }
  update() {
    console.warn("Abstract function.");
  }
  build(builder, output = null) {
    const refNode = this.getShared(builder);
    if (this !== refNode) {
      return refNode.build(builder, output);
    }
    builder.addNode(this);
    builder.addChain(this);
    let result = null;
    const buildStage = builder.getBuildStage();
    if (buildStage === "setup") {
      const properties = builder.getNodeProperties(this);
      if (properties.initialized !== true || builder.context.tempRead === false) {
        const stackNodesBeforeSetup = builder.stack.nodes.length;
        properties.initialized = true;
        properties.outputNode = this.setup(builder);
        if (properties.outputNode !== null && builder.stack.nodes.length !== stackNodesBeforeSetup) {
          properties.outputNode = builder.stack;
        }
        for (const childNode of Object.values(properties)) {
          if (childNode && childNode.isNode === true) {
            childNode.build(builder);
          }
        }
      }
    } else if (buildStage === "analyze") {
      this.analyze(builder);
    } else if (buildStage === "generate") {
      const isGenerateOnce = this.generate.length === 1;
      if (isGenerateOnce) {
        const type = this.getNodeType(builder);
        const nodeData = builder.getDataFromNode(this);
        result = nodeData.snippet;
        if (result === void 0) {
          result = this.generate(builder) || "";
          nodeData.snippet = result;
        }
        result = builder.format(result, type, output);
      } else {
        result = this.generate(builder, output) || "";
      }
    }
    builder.removeChain(this);
    return result;
  }
  getSerializeChildren() {
    return getNodeChildren(this);
  }
  serialize(json) {
    const nodeChildren = this.getSerializeChildren();
    const inputNodes = {};
    for (const { property, index, childNode } of nodeChildren) {
      if (index !== void 0) {
        if (inputNodes[property] === void 0) {
          inputNodes[property] = Number.isInteger(index) ? [] : {};
        }
        inputNodes[property][index] = childNode.toJSON(json.meta).uuid;
      } else {
        inputNodes[property] = childNode.toJSON(json.meta).uuid;
      }
    }
    if (Object.keys(inputNodes).length > 0) {
      json.inputNodes = inputNodes;
    }
  }
  deserialize(json) {
    if (json.inputNodes !== void 0) {
      const nodes = json.meta.nodes;
      for (const property in json.inputNodes) {
        if (Array.isArray(json.inputNodes[property])) {
          const inputArray = [];
          for (const uuid of json.inputNodes[property]) {
            inputArray.push(nodes[uuid]);
          }
          this[property] = inputArray;
        } else if (typeof json.inputNodes[property] === "object") {
          const inputObject = {};
          for (const subProperty in json.inputNodes[property]) {
            const uuid = json.inputNodes[property][subProperty];
            inputObject[subProperty] = nodes[uuid];
          }
          this[property] = inputObject;
        } else {
          const uuid = json.inputNodes[property];
          this[property] = nodes[uuid];
        }
      }
    }
  }
  toJSON(meta) {
    const { uuid, type } = this;
    const isRoot = meta === void 0 || typeof meta === "string";
    if (isRoot) {
      meta = {
        textures: {},
        images: {},
        nodes: {}
      };
    }
    let data = meta.nodes[uuid];
    if (data === void 0) {
      data = {
        uuid,
        type,
        meta,
        metadata: {
          version: 4.6,
          type: "Node",
          generator: "Node.toJSON"
        }
      };
      if (isRoot !== true) meta.nodes[data.uuid] = data;
      this.serialize(data);
      delete data.meta;
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
}
export default Node;
export function addNodeClass(type, nodeClass) {
  if (typeof nodeClass !== "function" || !type) throw new Error(`Node class ${type} is not a class`);
  if (NodeClasses.has(type)) {
    console.warn(`Redefinition of node class ${type}`);
    return;
  }
  NodeClasses.set(type, nodeClass);
  nodeClass.type = type;
}
export function createNodeFromType(type) {
  const Class = NodeClasses.get(type);
  if (Class !== void 0) {
    return new Class();
  }
}
