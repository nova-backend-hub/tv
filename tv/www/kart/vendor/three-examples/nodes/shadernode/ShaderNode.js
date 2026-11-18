import Node, { addNodeClass } from "../core/Node.js";
import ArrayElementNode from "../utils/ArrayElementNode.js";
import ConvertNode from "../utils/ConvertNode.js";
import JoinNode from "../utils/JoinNode.js";
import SplitNode from "../utils/SplitNode.js";
import SetNode from "../utils/SetNode.js";
import ConstNode from "../core/ConstNode.js";
import { getValueFromType, getValueType } from "../core/NodeUtils.js";
let currentStack = null;
const NodeElements = /* @__PURE__ */ new Map();
export function addNodeElement(name, nodeElement) {
  if (NodeElements.has(name)) {
    console.warn(`Redefinition of node element ${name}`);
    return;
  }
  if (typeof nodeElement !== "function") throw new Error(`Node element ${name} is not a function`);
  NodeElements.set(name, nodeElement);
}
const parseSwizzle = (props) => props.replace(/r|s/g, "x").replace(/g|t/g, "y").replace(/b|p/g, "z").replace(/a|q/g, "w");
const shaderNodeHandler = {
  setup(NodeClosure, params) {
    const inputs = params.shift();
    return NodeClosure(nodeObjects(inputs), ...params);
  },
  get(node, prop, nodeObj) {
    if (typeof prop === "string" && node[prop] === void 0) {
      if (node.isStackNode !== true && prop === "assign") {
        return (...params) => {
          currentStack.assign(nodeObj, ...params);
          return nodeObj;
        };
      } else if (NodeElements.has(prop)) {
        const nodeElement = NodeElements.get(prop);
        return node.isStackNode ? (...params) => nodeObj.add(nodeElement(...params)) : (...params) => nodeElement(nodeObj, ...params);
      } else if (prop === "self") {
        return node;
      } else if (prop.endsWith("Assign") && NodeElements.has(prop.slice(0, prop.length - "Assign".length))) {
        const nodeElement = NodeElements.get(prop.slice(0, prop.length - "Assign".length));
        return node.isStackNode ? (...params) => nodeObj.assign(params[0], nodeElement(...params)) : (...params) => nodeObj.assign(nodeElement(nodeObj, ...params));
      } else if (/^[xyzwrgbastpq]{1,4}$/.test(prop) === true) {
        prop = parseSwizzle(prop);
        return nodeObject(new SplitNode(nodeObj, prop));
      } else if (/^set[XYZWRGBASTPQ]{1,4}$/.test(prop) === true) {
        prop = parseSwizzle(prop.slice(3).toLowerCase());
        prop = prop.split("").sort().join("");
        return (value) => nodeObject(new SetNode(node, prop, value));
      } else if (prop === "width" || prop === "height" || prop === "depth") {
        if (prop === "width") prop = "x";
        else if (prop === "height") prop = "y";
        else if (prop === "depth") prop = "z";
        return nodeObject(new SplitNode(node, prop));
      } else if (/^\d+$/.test(prop) === true) {
        return nodeObject(new ArrayElementNode(nodeObj, new ConstNode(Number(prop), "uint")));
      }
    }
    return Reflect.get(node, prop, nodeObj);
  },
  set(node, prop, value, nodeObj) {
    if (typeof prop === "string" && node[prop] === void 0) {
      if (/^[xyzwrgbastpq]{1,4}$/.test(prop) === true || prop === "width" || prop === "height" || prop === "depth" || /^\d+$/.test(prop) === true) {
        nodeObj[prop].assign(value);
        return true;
      }
    }
    return Reflect.set(node, prop, value, nodeObj);
  }
};
const nodeObjectsCacheMap = /* @__PURE__ */ new WeakMap();
const nodeBuilderFunctionsCacheMap = /* @__PURE__ */ new WeakMap();
const ShaderNodeObject = function(obj, altType = null) {
  const type = getValueType(obj);
  if (type === "node") {
    let nodeObject2 = nodeObjectsCacheMap.get(obj);
    if (nodeObject2 === void 0) {
      nodeObject2 = new Proxy(obj, shaderNodeHandler);
      nodeObjectsCacheMap.set(obj, nodeObject2);
      nodeObjectsCacheMap.set(nodeObject2, nodeObject2);
    }
    return nodeObject2;
  } else if (altType === null && (type === "float" || type === "boolean") || type && type !== "shader" && type !== "string") {
    return nodeObject(getConstNode(obj, altType));
  } else if (type === "shader") {
    return tslFn(obj);
  }
  return obj;
};
const ShaderNodeObjects = function(objects, altType = null) {
  for (const name in objects) {
    objects[name] = nodeObject(objects[name], altType);
  }
  return objects;
};
const ShaderNodeArray = function(array, altType = null) {
  const len = array.length;
  for (let i = 0; i < len; i++) {
    array[i] = nodeObject(array[i], altType);
  }
  return array;
};
const ShaderNodeProxy = function(NodeClass, scope = null, factor = null, settings = null) {
  const assignNode = (node) => nodeObject(settings !== null ? Object.assign(node, settings) : node);
  if (scope === null) {
    return (...params) => {
      return assignNode(new NodeClass(...nodeArray(params)));
    };
  } else if (factor !== null) {
    factor = nodeObject(factor);
    return (...params) => {
      return assignNode(new NodeClass(scope, ...nodeArray(params), factor));
    };
  } else {
    return (...params) => {
      return assignNode(new NodeClass(scope, ...nodeArray(params)));
    };
  }
};
const ShaderNodeImmutable = function(NodeClass, ...params) {
  return nodeObject(new NodeClass(...nodeArray(params)));
};
class ShaderCallNodeInternal extends Node {
  constructor(shaderNode, inputNodes) {
    super();
    this.shaderNode = shaderNode;
    this.inputNodes = inputNodes;
  }
  getNodeType(builder) {
    const { outputNode } = builder.getNodeProperties(this);
    return outputNode ? outputNode.getNodeType(builder) : super.getNodeType(builder);
  }
  call(builder) {
    const { shaderNode, inputNodes } = this;
    if (shaderNode.layout) {
      let functionNodesCacheMap = nodeBuilderFunctionsCacheMap.get(builder.constructor);
      if (functionNodesCacheMap === void 0) {
        functionNodesCacheMap = /* @__PURE__ */ new WeakMap();
        nodeBuilderFunctionsCacheMap.set(builder.constructor, functionNodesCacheMap);
      }
      let functionNode = functionNodesCacheMap.get(shaderNode);
      if (functionNode === void 0) {
        functionNode = nodeObject(builder.buildFunctionNode(shaderNode));
        functionNodesCacheMap.set(shaderNode, functionNode);
      }
      if (builder.currentFunctionNode !== null) {
        builder.currentFunctionNode.includes.push(functionNode);
      }
      return nodeObject(functionNode.call(inputNodes));
    }
    const jsFunc = shaderNode.jsFunc;
    const outputNode = inputNodes !== null ? jsFunc(inputNodes, builder.stack, builder) : jsFunc(builder.stack, builder);
    return nodeObject(outputNode);
  }
  setup(builder) {
    builder.addStack();
    builder.stack.outputNode = this.call(builder);
    return builder.removeStack();
  }
  generate(builder, output) {
    const { outputNode } = builder.getNodeProperties(this);
    if (outputNode === null) {
      return this.call(builder).build(builder, output);
    }
    return super.generate(builder, output);
  }
}
class ShaderNodeInternal extends Node {
  constructor(jsFunc) {
    super();
    this.jsFunc = jsFunc;
    this.layout = null;
  }
  get isArrayInput() {
    return /^\(\s+?\[/.test(this.jsFunc.toString());
  }
  setLayout(layout) {
    this.layout = layout;
    return this;
  }
  call(inputs = null) {
    nodeObjects(inputs);
    return nodeObject(new ShaderCallNodeInternal(this, inputs));
  }
  setup() {
    return this.call();
  }
}
const bools = [false, true];
const uints = [0, 1, 2, 3];
const ints = [-1, -2];
const floats = [0.5, 1.5, 1 / 3, 1e-6, 1e6, Math.PI, Math.PI * 2, 1 / Math.PI, 2 / Math.PI, 1 / (Math.PI * 2), Math.PI / 2];
const boolsCacheMap = /* @__PURE__ */ new Map();
for (const bool2 of bools) boolsCacheMap.set(bool2, new ConstNode(bool2));
const uintsCacheMap = /* @__PURE__ */ new Map();
for (const uint2 of uints) uintsCacheMap.set(uint2, new ConstNode(uint2, "uint"));
const intsCacheMap = new Map([...uintsCacheMap].map((el) => new ConstNode(el.value, "int")));
for (const int2 of ints) intsCacheMap.set(int2, new ConstNode(int2, "int"));
const floatsCacheMap = new Map([...intsCacheMap].map((el) => new ConstNode(el.value)));
for (const float2 of floats) floatsCacheMap.set(float2, new ConstNode(float2));
for (const float2 of floats) floatsCacheMap.set(-float2, new ConstNode(-float2));
const cacheMaps = { bool: boolsCacheMap, uint: uintsCacheMap, ints: intsCacheMap, float: floatsCacheMap };
const constNodesCacheMap = new Map([...boolsCacheMap, ...floatsCacheMap]);
const getConstNode = (value, type) => {
  if (constNodesCacheMap.has(value)) {
    return constNodesCacheMap.get(value);
  } else if (value.isNode === true) {
    return value;
  } else {
    return new ConstNode(value, type);
  }
};
const safeGetNodeType = (node) => {
  try {
    return node.getNodeType();
  } catch (_) {
    return void 0;
  }
};
const ConvertType = function(type, cacheMap = null) {
  return (...params) => {
    if (params.length === 0 || !["bool", "float", "int", "uint"].includes(type) && params.every((param) => typeof param !== "object")) {
      params = [getValueFromType(type, ...params)];
    }
    if (params.length === 1 && cacheMap !== null && cacheMap.has(params[0])) {
      return nodeObject(cacheMap.get(params[0]));
    }
    if (params.length === 1) {
      const node = getConstNode(params[0], type);
      if (safeGetNodeType(node) === type) return nodeObject(node);
      return nodeObject(new ConvertNode(node, type));
    }
    const nodes = params.map((param) => getConstNode(param));
    return nodeObject(new JoinNode(nodes, type));
  };
};
export const getConstNodeType = (value) => value !== void 0 && value !== null ? value.nodeType || value.convertTo || (typeof value === "string" ? value : null) : null;
export function ShaderNode(jsFunc) {
  return new Proxy(new ShaderNodeInternal(jsFunc), shaderNodeHandler);
}
export const nodeObject = (val, altType = null) => (
  /* new */
  ShaderNodeObject(val, altType)
);
export const nodeObjects = (val, altType = null) => new ShaderNodeObjects(val, altType);
export const nodeArray = (val, altType = null) => new ShaderNodeArray(val, altType);
export const nodeProxy = (...params) => new ShaderNodeProxy(...params);
export const nodeImmutable = (...params) => new ShaderNodeImmutable(...params);
export const shader = (jsFunc) => {
  console.warn("TSL: shader() is deprecated. Use tslFn() instead.");
  return new ShaderNode(jsFunc);
};
export const tslFn = (jsFunc) => {
  const shaderNode = new ShaderNode(jsFunc);
  const fn = (...params) => {
    let inputs;
    nodeObjects(params);
    if (params[0] && params[0].isNode) {
      inputs = [...params];
    } else {
      inputs = params[0];
    }
    return shaderNode.call(inputs);
  };
  fn.shaderNode = shaderNode;
  fn.setLayout = (layout) => {
    shaderNode.setLayout(layout);
    return fn;
  };
  return fn;
};
addNodeClass("ShaderNode", ShaderNode);
export const setCurrentStack = (stack) => {
  if (currentStack === stack) {
  }
  currentStack = stack;
};
export const getCurrentStack = () => currentStack;
export const If = (...params) => currentStack.if(...params);
export function append(node) {
  if (currentStack) currentStack.add(node);
  return node;
}
addNodeElement("append", append);
export const color = new ConvertType("color");
export const float = new ConvertType("float", cacheMaps.float);
export const int = new ConvertType("int", cacheMaps.int);
export const uint = new ConvertType("uint", cacheMaps.uint);
export const bool = new ConvertType("bool", cacheMaps.bool);
export const vec2 = new ConvertType("vec2");
export const ivec2 = new ConvertType("ivec2");
export const uvec2 = new ConvertType("uvec2");
export const bvec2 = new ConvertType("bvec2");
export const vec3 = new ConvertType("vec3");
export const ivec3 = new ConvertType("ivec3");
export const uvec3 = new ConvertType("uvec3");
export const bvec3 = new ConvertType("bvec3");
export const vec4 = new ConvertType("vec4");
export const ivec4 = new ConvertType("ivec4");
export const uvec4 = new ConvertType("uvec4");
export const bvec4 = new ConvertType("bvec4");
export const mat3 = new ConvertType("mat3");
export const imat3 = new ConvertType("imat3");
export const umat3 = new ConvertType("umat3");
export const bmat3 = new ConvertType("bmat3");
export const mat4 = new ConvertType("mat4");
export const imat4 = new ConvertType("imat4");
export const umat4 = new ConvertType("umat4");
export const bmat4 = new ConvertType("bmat4");
export const string = (value = "") => nodeObject(new ConstNode(value, "string"));
export const arrayBuffer = (value) => nodeObject(new ConstNode(value, "ArrayBuffer"));
addNodeElement("color", color);
addNodeElement("float", float);
addNodeElement("int", int);
addNodeElement("uint", uint);
addNodeElement("bool", bool);
addNodeElement("vec2", vec2);
addNodeElement("ivec2", ivec2);
addNodeElement("uvec2", uvec2);
addNodeElement("bvec2", bvec2);
addNodeElement("vec3", vec3);
addNodeElement("ivec3", ivec3);
addNodeElement("uvec3", uvec3);
addNodeElement("bvec3", bvec3);
addNodeElement("vec4", vec4);
addNodeElement("ivec4", ivec4);
addNodeElement("uvec4", uvec4);
addNodeElement("bvec4", bvec4);
addNodeElement("mat3", mat3);
addNodeElement("imat3", imat3);
addNodeElement("umat3", umat3);
addNodeElement("bmat3", bmat3);
addNodeElement("mat4", mat4);
addNodeElement("imat4", imat4);
addNodeElement("umat4", umat4);
addNodeElement("bmat4", bmat4);
addNodeElement("string", string);
addNodeElement("arrayBuffer", arrayBuffer);
export const element = nodeProxy(ArrayElementNode);
export const convert = (node, types) => nodeObject(new ConvertNode(nodeObject(node), types));
export const split = (node, channels) => nodeObject(new SplitNode(nodeObject(node), channels));
addNodeElement("element", element);
addNodeElement("convert", convert);
