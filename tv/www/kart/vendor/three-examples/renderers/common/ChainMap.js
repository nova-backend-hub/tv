export default class ChainMap {
  constructor() {
    this.weakMap = /* @__PURE__ */ new WeakMap();
  }
  get(keys) {
    if (Array.isArray(keys)) {
      let map = this.weakMap;
      for (let i = 0; i < keys.length; i++) {
        map = map.get(keys[i]);
        if (map === void 0) return void 0;
      }
      return map.get(keys[keys.length - 1]);
    } else {
      return super.get(keys);
    }
  }
  set(keys, value) {
    if (Array.isArray(keys)) {
      let map = this.weakMap;
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (map.has(key) === false) map.set(key, /* @__PURE__ */ new WeakMap());
        map = map.get(key);
      }
      return map.set(keys[keys.length - 1], value);
    } else {
      return super.set(keys, value);
    }
  }
  delete(keys) {
    if (Array.isArray(keys)) {
      let map = this.weakMap;
      for (let i = 0; i < keys.length; i++) {
        map = map.get(keys[i]);
        if (map === void 0) return false;
      }
      return map.delete(keys[keys.length - 1]);
    } else {
      return super.delete(keys);
    }
  }
  dispose() {
    this.weakMap.clear();
  }
}
