class DataMap {
  constructor() {
    this.data = /* @__PURE__ */ new WeakMap();
  }
  get(object) {
    let map = this.data.get(object);
    if (map === void 0) {
      map = {};
      this.data.set(object, map);
    }
    return map;
  }
  delete(object) {
    let map;
    if (this.data.has(object)) {
      map = this.data.get(object);
      this.data.delete(object);
    }
    return map;
  }
  has(object) {
    return this.data.has(object);
  }
  dispose() {
    this.data.clear();
  }
}
export default DataMap;
