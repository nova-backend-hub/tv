class NodeUniform {
  constructor(name, type, node, needsUpdate = void 0) {
    this.isNodeUniform = true;
    this.name = name;
    this.type = type;
    this.node = node.getSelf();
    this.needsUpdate = needsUpdate;
  }
  get value() {
    return this.node.value;
  }
  set value(val) {
    this.node.value = val;
  }
  get id() {
    return this.node.id;
  }
  get groupNode() {
    return this.node.groupNode;
  }
}
export default NodeUniform;
