import Node, { addNodeClass } from "./Node.js";
import NodeCache from "./NodeCache.js";
import { addNodeElement, nodeProxy } from "../shadernode/ShaderNode.js";
class CacheNode extends Node {
  constructor(node, cache2 = new NodeCache()) {
    super();
    this.isCacheNode = true;
    this.node = node;
    this.cache = cache2;
  }
  getNodeType(builder) {
    return this.node.getNodeType(builder);
  }
  build(builder, ...params) {
    const previousCache = builder.getCache();
    const cache2 = this.cache || builder.globalCache;
    builder.setCache(cache2);
    const data = this.node.build(builder, ...params);
    builder.setCache(previousCache);
    return data;
  }
}
export default CacheNode;
export const cache = nodeProxy(CacheNode);
export const globalCache = (node) => cache(node, null);
addNodeElement("cache", cache);
addNodeElement("globalCache", globalCache);
addNodeClass("CacheNode", CacheNode);
