import {
  AnimationClip,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  ClampToEdgeWrapping,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Euler,
  Group,
  LoaderUtils,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MirroredRepeatWrapping,
  NoColorSpace,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  PointLight,
  Quaternion,
  QuaternionKeyframeTrack,
  RectAreaLight,
  RepeatWrapping,
  ShapeUtils,
  SkinnedMesh,
  Skeleton,
  Bone,
  SphereGeometry,
  SpotLight,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  VectorKeyframeTrack
} from "three";
const VARIANT_PATH_REGEX = /^(.+?)\/\{(\w+)=(\w+)\}\/(.+)$/;
const SpecType = {
  Unknown: 0,
  Attribute: 1,
  Connection: 2,
  Expression: 3,
  Mapper: 4,
  MapperArg: 5,
  Prim: 6,
  PseudoRoot: 7,
  Relationship: 8,
  RelationshipTarget: 9,
  Variant: 10,
  VariantSet: 11
};
const USD_CAMERA_DEFAULTS = {
  projection: "perspective",
  clippingRange: [1, 1e6],
  horizontalAperture: 20.955,
  verticalAperture: 15.2908,
  horizontalApertureOffset: 0,
  verticalApertureOffset: 0,
  focalLength: 50,
  focusDistance: 0,
  fStop: 0
};
class USDComposer {
  constructor(manager = null) {
    this.textureCache = {};
    this.skinnedMeshes = [];
    this.manager = manager;
    this.texturePromises = [];
  }
  /**
   * Compose a Three.js scene from parsed USD data.
   * @param {Object} parsedData - Data from USDCParser or USDAParser
   * @param {Object} assets - Dictionary of referenced assets (specsByPath or blob URLs)
   * @param {Object} variantSelections - External variant selections
   * @param {string} basePath - Base path for resolving relative references
   * @returns {Group} Three.js scene graph
   */
  compose(parsedData, assets = {}, variantSelections = {}, basePath = "") {
    this.specsByPath = parsedData.specsByPath;
    this.assets = assets;
    this.externalVariantSelections = variantSelections;
    this.basePath = basePath;
    this.skinnedMeshes = [];
    this.skeletons = {};
    this.texturePromises = [];
    this._buildIndexes();
    const rootSpec = this.specsByPath["/"];
    const rootFields = rootSpec ? rootSpec.fields : {};
    this.fps = rootFields.timeCodesPerSecond || rootFields.framesPerSecond || 24;
    const group = new Group();
    this._buildHierarchy(group, "/");
    this._bindSkeletons();
    const skeletonPaths = Object.keys(this.skeletons);
    if (skeletonPaths.length === 1) {
      group.skeleton = this.skeletons[skeletonPaths[0]].skeleton;
    }
    group.animations = this._buildAnimations();
    const metersPerUnit = rootFields.metersPerUnit;
    if (metersPerUnit !== void 0 && metersPerUnit !== 1) {
      group.scale.setScalar(metersPerUnit);
    }
    if (rootSpec && rootSpec.fields && rootSpec.fields.upAxis === "Z") {
      group.rotation.x = -Math.PI / 2;
    }
    return group;
  }
  /**
   * Apply USD transforms to a Three.js object.
   * Handles xformOpOrder with proper matrix composition.
   * USD uses row-vector convention, Three.js uses column-vector.
   */
  applyTransform(obj, fields, attrs = {}) {
    const data = { ...fields, ...attrs };
    const xformOpOrder = data["xformOpOrder"];
    if (xformOpOrder && xformOpOrder.length > 0) {
      const matrix = new Matrix4();
      const tempMatrix = new Matrix4();
      let scaleValues = null;
      for (let i = 0; i < xformOpOrder.length; i++) {
        const op = xformOpOrder[i];
        const isInverse = op.startsWith("!invert!");
        const opName = isInverse ? op.slice(8) : op;
        if (opName === "xformOp:transform") {
          const m = data["xformOp:transform"];
          if (m && m.length === 16) {
            tempMatrix.set(
              m[0],
              m[4],
              m[8],
              m[12],
              m[1],
              m[5],
              m[9],
              m[13],
              m[2],
              m[6],
              m[10],
              m[14],
              m[3],
              m[7],
              m[11],
              m[15]
            );
            if (isInverse) tempMatrix.invert();
            matrix.multiply(tempMatrix);
          }
        } else if (opName === "xformOp:translate") {
          const t = data["xformOp:translate"];
          if (t) {
            tempMatrix.makeTranslation(t[0], t[1], t[2]);
            if (isInverse) tempMatrix.invert();
            matrix.multiply(tempMatrix);
          }
        } else if (opName === "xformOp:translate:pivot") {
          const t = data["xformOp:translate:pivot"];
          if (t) {
            tempMatrix.makeTranslation(t[0], t[1], t[2]);
            if (isInverse) tempMatrix.invert();
            matrix.multiply(tempMatrix);
          }
        } else if (opName === "xformOp:scale") {
          const s = data["xformOp:scale"];
          if (s) {
            if (Array.isArray(s)) {
              tempMatrix.makeScale(s[0], s[1], s[2]);
              scaleValues = [s[0], s[1], s[2]];
            } else {
              tempMatrix.makeScale(s, s, s);
              scaleValues = [s, s, s];
            }
            if (isInverse) tempMatrix.invert();
            matrix.multiply(tempMatrix);
          }
        } else if (opName === "xformOp:rotateXYZ") {
          const r = data["xformOp:rotateXYZ"];
          if (r) {
            const euler = new Euler(
              r[0] * Math.PI / 180,
              r[1] * Math.PI / 180,
              r[2] * Math.PI / 180,
              "ZYX"
            );
            tempMatrix.makeRotationFromEuler(euler);
            if (isInverse) tempMatrix.invert();
            matrix.multiply(tempMatrix);
          }
        } else if (opName === "xformOp:rotateX") {
          const r = data["xformOp:rotateX"];
          if (r !== void 0) {
            tempMatrix.makeRotationX(r * Math.PI / 180);
            if (isInverse) tempMatrix.invert();
            matrix.multiply(tempMatrix);
          }
        } else if (opName === "xformOp:rotateY") {
          const r = data["xformOp:rotateY"];
          if (r !== void 0) {
            tempMatrix.makeRotationY(r * Math.PI / 180);
            if (isInverse) tempMatrix.invert();
            matrix.multiply(tempMatrix);
          }
        } else if (opName === "xformOp:rotateZ") {
          const r = data["xformOp:rotateZ"];
          if (r !== void 0) {
            tempMatrix.makeRotationZ(r * Math.PI / 180);
            if (isInverse) tempMatrix.invert();
            matrix.multiply(tempMatrix);
          }
        } else if (opName === "xformOp:orient") {
          const q = data["xformOp:orient"];
          if (q && q.length === 4) {
            const quat = new Quaternion(q[0], q[1], q[2], q[3]);
            tempMatrix.makeRotationFromQuaternion(quat);
            if (isInverse) tempMatrix.invert();
            matrix.multiply(tempMatrix);
          }
        }
      }
      obj.matrix.copy(matrix);
      obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
      if (scaleValues) {
        const negX = scaleValues[0] < 0;
        const negY = scaleValues[1] < 0;
        const negZ = scaleValues[2] < 0;
        const negCount = (negX ? 1 : 0) + (negY ? 1 : 0) + (negZ ? 1 : 0);
        if (negCount === 3) {
          obj.scale.set(scaleValues[0], scaleValues[1], scaleValues[2]);
          obj.quaternion.set(
            obj.quaternion.x,
            -obj.quaternion.y,
            obj.quaternion.z,
            -obj.quaternion.w
          );
        }
      }
      return;
    }
    if (data["xformOp:translate"]) {
      const t = data["xformOp:translate"];
      obj.position.set(t[0], t[1], t[2]);
    }
    if (data["xformOp:translate:pivot"]) {
      const p = data["xformOp:translate:pivot"];
      obj.pivot = new Vector3(p[0], p[1], p[2]);
    }
    if (data["xformOp:scale"]) {
      const s = data["xformOp:scale"];
      if (Array.isArray(s)) {
        obj.scale.set(s[0], s[1], s[2]);
      } else {
        obj.scale.set(s, s, s);
      }
    }
    if (data["xformOp:rotateXYZ"]) {
      const r = data["xformOp:rotateXYZ"];
      obj.rotation.set(
        r[0] * Math.PI / 180,
        r[1] * Math.PI / 180,
        r[2] * Math.PI / 180
      );
    }
    if (data["xformOp:orient"]) {
      const q = data["xformOp:orient"];
      if (q.length === 4) {
        obj.quaternion.set(q[0], q[1], q[2], q[3]);
      }
    }
  }
  /**
   * Build indexes for efficient lookups.
   * Called once during compose() to avoid O(n) scans per lookup.
   */
  _buildIndexes() {
    this.childrenByPath = /* @__PURE__ */ new Map();
    this.attributesByPrimPath = /* @__PURE__ */ new Map();
    this.materialsByRoot = /* @__PURE__ */ new Map();
    this.shadersByMaterialPath = /* @__PURE__ */ new Map();
    this.geomSubsetsByMeshPath = /* @__PURE__ */ new Map();
    for (const path in this.specsByPath) {
      const spec = this.specsByPath[path];
      if (spec.specType === SpecType.Prim) {
        const lastSlash = path.lastIndexOf("/");
        if (lastSlash > 0) {
          const parentPath = path.slice(0, lastSlash);
          const childName = path.slice(lastSlash + 1);
          if (!this.childrenByPath.has(parentPath)) {
            this.childrenByPath.set(parentPath, []);
          }
          this.childrenByPath.get(parentPath).push({ name: childName, path });
        } else if (lastSlash === 0 && path.length > 1) {
          const childName = path.slice(1);
          if (!this.childrenByPath.has("/")) {
            this.childrenByPath.set("/", []);
          }
          this.childrenByPath.get("/").push({ name: childName, path });
        }
        const typeName = spec.fields.typeName;
        if (typeName === "Material") {
          const parts = path.split("/");
          const rootPath = parts.length > 1 ? "/" + parts[1] : "/";
          if (!this.materialsByRoot.has(rootPath)) {
            this.materialsByRoot.set(rootPath, []);
          }
          this.materialsByRoot.get(rootPath).push(path);
        }
        if (typeName === "Shader" && lastSlash > 0) {
          let ancestorPath = path.slice(0, lastSlash);
          while (ancestorPath.length > 0) {
            const ancestorSpec = this.specsByPath[ancestorPath];
            if (ancestorSpec && ancestorSpec.specType === SpecType.Prim && ancestorSpec.fields.typeName === "Material") {
              if (!this.shadersByMaterialPath.has(ancestorPath)) {
                this.shadersByMaterialPath.set(ancestorPath, []);
              }
              this.shadersByMaterialPath.get(ancestorPath).push(path);
              break;
            }
            const slash = ancestorPath.lastIndexOf("/");
            if (slash <= 0) break;
            ancestorPath = ancestorPath.slice(0, slash);
          }
        }
        if (typeName === "GeomSubset" && lastSlash > 0) {
          const meshPath = path.slice(0, lastSlash);
          if (!this.geomSubsetsByMeshPath.has(meshPath)) {
            this.geomSubsetsByMeshPath.set(meshPath, []);
          }
          this.geomSubsetsByMeshPath.get(meshPath).push(path);
        }
      } else if (spec.specType === SpecType.Attribute || spec.specType === SpecType.Relationship) {
        const dotIndex = path.lastIndexOf(".");
        if (dotIndex > 0) {
          const primPath = path.slice(0, dotIndex);
          const attrName = path.slice(dotIndex + 1);
          if (!this.attributesByPrimPath.has(primPath)) {
            this.attributesByPrimPath.set(primPath, /* @__PURE__ */ new Map());
          }
          this.attributesByPrimPath.get(primPath).set(attrName, spec);
        }
      }
    }
  }
  /**
   * Check if a path is a direct child of parentPath.
   */
  _isDirectChild(parentPath, path, prefix) {
    if (!path.startsWith(prefix)) return false;
    const remainder = path.slice(prefix.length);
    if (remainder.length === 0) return false;
    if (remainder.startsWith("{")) {
      return false;
    }
    return !remainder.includes("/");
  }
  /**
   * Build the scene hierarchy recursively.
   * Uses childrenByPath index for O(1) child lookup instead of O(n) iteration.
   */
  _buildHierarchy(parent, parentPath) {
    const childEntries = [];
    const seenPaths = /* @__PURE__ */ new Set();
    const directChildren = this.childrenByPath.get(parentPath);
    if (directChildren) {
      for (const child of directChildren) {
        if (!seenPaths.has(child.path)) {
          seenPaths.add(child.path);
          childEntries.push(child);
        }
      }
    }
    const variantPaths = this._getVariantPaths(parentPath);
    for (const vp of variantPaths) {
      const variantChildren = this.childrenByPath.get(vp);
      if (variantChildren) {
        for (const child of variantChildren) {
          if (!seenPaths.has(child.path)) {
            seenPaths.add(child.path);
            childEntries.push(child);
          }
        }
      }
    }
    for (const { name, path } of childEntries) {
      const spec = this.specsByPath[path];
      if (!spec || spec.specType !== SpecType.Prim) continue;
      const typeName = spec.fields.typeName;
      const refValues = this._getReferences(spec);
      if (refValues.length > 0) {
        const localVariants = this._getLocalVariantSelections(spec.fields);
        const resolvedGroups = [];
        for (const refValue of refValues) {
          const referencedGroup = this._resolveReference(refValue, localVariants);
          if (referencedGroup) resolvedGroups.push(referencedGroup);
        }
        if (resolvedGroups.length > 0) {
          const attrs = this._getAttributes(path);
          if (resolvedGroups.length === 1) {
            const singleMesh = this._findSingleMesh(resolvedGroups[0]);
            if (singleMesh && (typeName === "Xform" || !typeName)) {
              singleMesh.name = name;
              this.applyTransform(singleMesh, spec.fields, attrs);
              this._applyMaterialBinding(singleMesh, path);
              parent.add(singleMesh);
              this._buildHierarchy(singleMesh, path);
              continue;
            }
          }
          const obj = new Object3D();
          obj.name = name;
          this.applyTransform(obj, spec.fields, attrs);
          for (const referencedGroup of resolvedGroups) {
            while (referencedGroup.children.length > 0) {
              obj.add(referencedGroup.children[0]);
            }
          }
          parent.add(obj);
          this._buildHierarchy(obj, path);
          continue;
        }
      }
      if (typeName === "SkelRoot") {
        const obj = new Object3D();
        obj.name = name;
        obj.userData.isSkelRoot = true;
        const attrs = this._getAttributes(path);
        this.applyTransform(obj, spec.fields, attrs);
        parent.add(obj);
        this._buildHierarchy(obj, path);
      } else if (typeName === "Skeleton") {
        const skeleton = this._buildSkeleton(path);
        if (skeleton) {
          this.skeletons[path] = skeleton;
        }
        this._buildHierarchy(parent, path);
      } else if (typeName === "SkelAnimation") {
      } else if (typeName === "Mesh") {
        const obj = this._buildMesh(path, spec);
        if (obj) {
          parent.add(obj);
          this._buildHierarchy(obj, path);
        }
      } else if (typeName === "Camera") {
        const obj = this._buildCamera(path);
        obj.name = name;
        const attrs = this._getAttributes(path);
        this.applyTransform(obj, spec.fields, attrs);
        parent.add(obj);
        this._buildHierarchy(obj, path);
      } else if (typeName === "DistantLight" || typeName === "SphereLight" || typeName === "RectLight" || typeName === "DiskLight") {
        const obj = this._buildLight(path, typeName);
        obj.name = name;
        const attrs = this._getAttributes(path);
        this.applyTransform(obj, spec.fields, attrs);
        parent.add(obj);
        this._buildHierarchy(obj, path);
      } else if (typeName === "Cube" || typeName === "Sphere" || typeName === "Cylinder" || typeName === "Cone" || typeName === "Capsule") {
        const obj = this._buildGeomPrimitive(path, spec, typeName);
        if (obj) {
          parent.add(obj);
          this._buildHierarchy(obj, path);
        }
      } else if (typeName === "Material" || typeName === "Shader" || typeName === "GeomSubset") {
      } else {
        const obj = new Object3D();
        obj.name = name;
        const attrs = this._getAttributes(path);
        this.applyTransform(obj, spec.fields, attrs);
        parent.add(obj);
        this._buildHierarchy(obj, path);
      }
    }
  }
  /**
   * Get variant paths for a parent path based on variant selections.
   */
  _getVariantPaths(parentPath) {
    var _a, _b;
    const parentSpec = this.specsByPath[parentPath];
    const variantSetChildren = (_a = parentSpec == null ? void 0 : parentSpec.fields) == null ? void 0 : _a.variantSetChildren;
    const variantPaths = [];
    if (!variantSetChildren || variantSetChildren.length === 0) {
      return variantPaths;
    }
    for (const variantSetName of variantSetChildren) {
      let selectedVariant = this.externalVariantSelections[variantSetName] || null;
      if (!selectedVariant) {
        const variantSelection = parentSpec.fields.variantSelection;
        selectedVariant = variantSelection ? variantSelection[variantSetName] : null;
      }
      if (!selectedVariant) {
        const variantSetPath = parentPath + "/{" + variantSetName + "=}";
        const variantSetSpec = this.specsByPath[variantSetPath];
        if ((_b = variantSetSpec == null ? void 0 : variantSetSpec.fields) == null ? void 0 : _b.variantChildren) {
          selectedVariant = variantSetSpec.fields.variantChildren[0];
        }
      }
      if (selectedVariant) {
        const variantPath = parentPath + "/{" + variantSetName + "=" + selectedVariant + "}";
        variantPaths.push(variantPath);
      }
    }
    return variantPaths;
  }
  /**
   * Resolve a file path relative to basePath.
   */
  _resolveFilePath(refPath) {
    let cleanPath = refPath;
    if (cleanPath.startsWith("./")) {
      cleanPath = cleanPath.slice(2);
    }
    if (!this.basePath) return cleanPath;
    const base = this.basePath.endsWith("/") ? this.basePath : this.basePath + "/";
    return LoaderUtils.resolveURL(cleanPath, base);
  }
  /**
   * Resolve a USD reference and return the composed content.
   * @param {string} refValue - Reference value like "@./path/to/file.usdc@"
   * @param {Object} localVariants - Variant selections to apply
   * @returns {Group|null} Composed content or null
   */
  _resolveReference(refValue, localVariants = {}) {
    if (!refValue) return null;
    const match = refValue.match(/@([^@]+)@(?:<([^>]+)>)?/);
    if (!match) return null;
    const filePath = match[1];
    const primPath = match[2];
    const resolvedPath = this._resolveFilePath(filePath);
    const mergedVariants = { ...localVariants, ...this.externalVariantSelections };
    const referencedData = this.assets[resolvedPath];
    if (!referencedData) return null;
    if (referencedData.specsByPath) {
      const composer = new USDComposer(this.manager);
      const newBasePath = this._getBasePath(resolvedPath);
      const composedGroup = composer.compose(referencedData, this.assets, mergedVariants, newBasePath);
      if (primPath) {
        const primName = primPath.split("/").pop();
        let targetObject = null;
        for (const child of composedGroup.children) {
          if (child.name === primName) {
            targetObject = child;
            break;
          }
        }
        if (targetObject) {
          composedGroup.remove(targetObject);
          const wrapper = new Group();
          wrapper.add(targetObject);
          return wrapper;
        }
      }
      return composedGroup;
    }
    if (referencedData.isGroup || referencedData.isObject3D) {
      return referencedData.clone();
    }
    return null;
  }
  /**
   * Find a single mesh in the group's shallow hierarchy.
   * Only returns a mesh if it's at depth 0 or 1, not deeply nested.
   * This preserves transforms in complex hierarchies like Kitchen Set
   * while supporting USDZExporter round-trip (Xform > Xform > Mesh pattern).
   */
  _findSingleMesh(group) {
    for (const child of group.children) {
      if (child.isMesh) {
        group.remove(child);
        return child;
      }
    }
    if (group.children.length === 1) {
      const child = group.children[0];
      if (child.children && child.children.length === 1) {
        const grandchild = child.children[0];
        if (grandchild.isMesh && !this._hasNonIdentityTransform(child)) {
          child.remove(grandchild);
          return grandchild;
        }
      }
    }
    return null;
  }
  /**
   * Check if an object has a non-identity local transform.
   */
  _hasNonIdentityTransform(obj) {
    const pos = obj.position;
    const rot = obj.rotation;
    const scale = obj.scale;
    const hasPosition = pos.x !== 0 || pos.y !== 0 || pos.z !== 0;
    const hasRotation = rot.x !== 0 || rot.y !== 0 || rot.z !== 0;
    const hasScale = scale.x !== 1 || scale.y !== 1 || scale.z !== 1;
    return hasPosition || hasRotation || hasScale;
  }
  /**
   * Get the base path (directory) from a file path.
   */
  _getBasePath(filePath) {
    const lastSlash = filePath.lastIndexOf("/");
    return lastSlash >= 0 ? filePath.slice(0, lastSlash) : "";
  }
  /**
   * Extract variant selections from a spec's fields.
   */
  _getLocalVariantSelections(fields) {
    const variants = {};
    if (fields.variantSelection) {
      for (const key in fields.variantSelection) {
        variants[key] = fields.variantSelection[key];
      }
    }
    return variants;
  }
  /**
   * Get all reference values from a prim spec.
   * @returns {string[]} Array of reference strings like "@path@" or "@path@<prim>"
   */
  _getReferences(spec) {
    const results = [];
    if (spec.fields.references && spec.fields.references.length > 0) {
      const ref = spec.fields.references[0];
      if (typeof ref === "string") {
        const matches = ref.matchAll(/@([^@]+)@(?:<([^>]+)>)?/g);
        for (const match of matches) {
          results.push(match[0]);
        }
      } else if (ref.assetPath) {
        results.push("@" + ref.assetPath + "@");
      }
    }
    if (results.length === 0 && spec.fields.payload) {
      const payload = spec.fields.payload;
      if (typeof payload === "string") results.push(payload);
      else if (payload.assetPath) results.push("@" + payload.assetPath + "@");
    }
    return results;
  }
  /**
   * Get attributes for a path from attribute specs.
   */
  _getAttributes(path) {
    const attrs = {};
    this._collectAttributesFromPath(path, attrs);
    const variantMatch = path.match(VARIANT_PATH_REGEX);
    if (variantMatch) {
      const basePath = variantMatch[1];
      const relativePath = variantMatch[4];
      const variantPaths = this._getVariantPaths(basePath);
      for (const vp of variantPaths) {
        if (path.startsWith(vp)) continue;
        const overridePath = vp + "/" + relativePath;
        this._collectAttributesFromPath(overridePath, attrs);
      }
    } else {
      const parts = path.split("/");
      for (let i = 1; i < parts.length - 1; i++) {
        const ancestorPath = parts.slice(0, i + 1).join("/");
        const relativePath = parts.slice(i + 1).join("/");
        const variantPaths = this._getVariantPaths(ancestorPath);
        for (const vp of variantPaths) {
          const overridePath = vp + "/" + relativePath;
          this._collectAttributesFromPath(overridePath, attrs);
        }
      }
    }
    return attrs;
  }
  _collectAttributesFromPath(path, attrs) {
    var _a, _b, _c, _d;
    const attrMap = this.attributesByPrimPath.get(path);
    if (!attrMap) return;
    for (const [attrName, attrSpec] of attrMap) {
      if (((_a = attrSpec.fields) == null ? void 0 : _a.default) !== void 0) {
        attrs[attrName] = attrSpec.fields.default;
      } else if ((_b = attrSpec.fields) == null ? void 0 : _b.timeSamples) {
        const { times, values } = attrSpec.fields.timeSamples;
        if (times && values && times.length > 0) {
          const idx = times.indexOf(0);
          attrs[attrName] = idx >= 0 ? values[idx] : values[0];
        }
      }
      if (((_c = attrSpec.fields) == null ? void 0 : _c.elementSize) !== void 0) {
        attrs[attrName + ":elementSize"] = attrSpec.fields.elementSize;
      }
      if (attrName.startsWith("primvars:") && ((_d = attrSpec.fields) == null ? void 0 : _d.typeName) !== void 0) {
        attrs[attrName + ":typeName"] = attrSpec.fields.typeName;
      }
    }
  }
  /**
   * Build a mesh from a USD geometric primitive (Cube, Sphere, Cylinder, Cone, Capsule).
   */
  _buildGeomPrimitive(path, spec, typeName) {
    const attrs = this._getAttributes(path);
    const name = path.split("/").pop();
    let geometry;
    switch (typeName) {
      case "Cube": {
        const size = attrs["size"] || 2;
        geometry = new BoxGeometry(size, size, size);
        break;
      }
      case "Sphere": {
        const radius = attrs["radius"] || 1;
        geometry = new SphereGeometry(radius, 32, 16);
        break;
      }
      case "Cylinder": {
        const height = attrs["height"] || 2;
        const radius = attrs["radius"] || 1;
        geometry = new CylinderGeometry(radius, radius, height, 32);
        break;
      }
      case "Cone": {
        const height = attrs["height"] || 2;
        const radius = attrs["radius"] || 1;
        geometry = new ConeGeometry(radius, height, 32);
        break;
      }
      case "Capsule": {
        const height = attrs["height"] || 1;
        const radius = attrs["radius"] || 0.5;
        geometry = new CapsuleGeometry(radius, height, 16, 32);
        break;
      }
    }
    const axis = attrs["axis"] || "Z";
    if (axis === "X") {
      geometry.rotateZ(-Math.PI / 2);
    } else if (axis === "Z") {
      geometry.rotateX(Math.PI / 2);
    }
    const material = this._buildMaterial(path, spec.fields);
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    this.applyTransform(mesh, spec.fields, attrs);
    return mesh;
  }
  /**
   * Build a mesh from a Mesh spec.
   */
  _buildMesh(path, spec) {
    const attrs = this._getAttributes(path);
    const jointIndices = attrs["primvars:skel:jointIndices"];
    const jointWeights = attrs["primvars:skel:jointWeights"];
    const hasSkinning = jointIndices && jointWeights && jointIndices.length > 0 && jointWeights.length > 0;
    const geomSubsets = this._getGeomSubsets(path);
    let geometry, material;
    if (geomSubsets.length > 0) {
      geometry = this._buildGeometryWithSubsets(attrs, geomSubsets, hasSkinning);
      const meshMaterialPath = this._getMaterialPath(path, spec.fields);
      material = geomSubsets.map((subset) => {
        const matPath = subset.materialPath || meshMaterialPath;
        return this._buildMaterialForPath(matPath);
      });
    } else {
      geometry = this._buildGeometry(path, attrs, hasSkinning);
      material = this._buildMaterial(path, spec.fields);
    }
    const displayColor = attrs["primvars:displayColor"];
    if (displayColor && displayColor.length >= 3) {
      const applyDisplayColor = (mat) => {
        if (mat.color && mat.color.r === 1 && mat.color.g === 1 && mat.color.b === 1 && !mat.map) {
          mat.color.setRGB(displayColor[0], displayColor[1], displayColor[2], SRGBColorSpace);
        }
      };
      if (Array.isArray(material)) {
        material.forEach(applyDisplayColor);
      } else {
        applyDisplayColor(material);
      }
    }
    const displayOpacity = attrs["primvars:displayOpacity"];
    if (displayOpacity && displayOpacity.length === 1 && geomSubsets.length === 0) {
      const opacity = displayOpacity[0];
      const applyDisplayOpacity = (mat) => {
        if (opacity < 1 && mat.opacity === 1 && mat.transparent === false) {
          mat.opacity = opacity;
          mat.transparent = true;
        }
      };
      if (Array.isArray(material)) {
        material.forEach(applyDisplayOpacity);
      } else {
        applyDisplayOpacity(material);
      }
    }
    let mesh;
    if (hasSkinning) {
      mesh = new SkinnedMesh(geometry, material);
      let skelBindingSpec = this.specsByPath[path + ".skel:skeleton"];
      if (!skelBindingSpec) {
        skelBindingSpec = this.specsByPath[path + ".rel skel:skeleton"];
      }
      let skeletonPath = null;
      if (skelBindingSpec) {
        if (skelBindingSpec.fields.targetPaths && skelBindingSpec.fields.targetPaths.length > 0) {
          skeletonPath = skelBindingSpec.fields.targetPaths[0];
        } else if (skelBindingSpec.fields.default) {
          skeletonPath = skelBindingSpec.fields.default.replace(/<|>/g, "");
        }
      }
      const localJoints = attrs["skel:joints"];
      const geomBindTransform = attrs["primvars:skel:geomBindTransform"];
      this.skinnedMeshes.push({ mesh, skeletonPath, path, localJoints, geomBindTransform });
    } else {
      mesh = new Mesh(geometry, material);
    }
    mesh.name = path.split("/").pop();
    this.applyTransform(mesh, spec.fields, attrs);
    return mesh;
  }
  /**
   * Build a camera from a Camera spec.
   */
  _buildCamera(path) {
    const attrs = this._getAttributes(path);
    const projectionToken = attrs["projection"];
    const projection = typeof projectionToken === "string" ? projectionToken.toLowerCase() : USD_CAMERA_DEFAULTS.projection;
    const clippingRange = attrs["clippingRange"] || USD_CAMERA_DEFAULTS.clippingRange;
    const near = Math.max(
      Number.EPSILON,
      this._parseNumber(clippingRange[0], USD_CAMERA_DEFAULTS.clippingRange[0])
    );
    const far = Math.max(
      near + Number.EPSILON,
      this._parseNumber(clippingRange[1], USD_CAMERA_DEFAULTS.clippingRange[1])
    );
    const horizontalAperture = this._parseNumber(
      attrs["horizontalAperture"],
      USD_CAMERA_DEFAULTS.horizontalAperture
    );
    const verticalAperture = this._parseNumber(
      attrs["verticalAperture"],
      USD_CAMERA_DEFAULTS.verticalAperture
    );
    const horizontalApertureOffset = this._parseNumber(
      attrs["horizontalApertureOffset"],
      USD_CAMERA_DEFAULTS.horizontalApertureOffset
    );
    const verticalApertureOffset = this._parseNumber(
      attrs["verticalApertureOffset"],
      USD_CAMERA_DEFAULTS.verticalApertureOffset
    );
    const focalLength = this._parseNumber(attrs["focalLength"], USD_CAMERA_DEFAULTS.focalLength);
    const focusDistance = this._parseNumber(attrs["focusDistance"], USD_CAMERA_DEFAULTS.focusDistance);
    const fStop = this._parseNumber(attrs["fStop"], USD_CAMERA_DEFAULTS.fStop);
    let camera;
    if (projection === "orthographic") {
      const width = horizontalAperture / 10;
      const height = verticalAperture / 10;
      const offsetX = horizontalApertureOffset / 10;
      const offsetY = verticalApertureOffset / 10;
      camera = new OrthographicCamera(
        offsetX - width * 0.5,
        offsetX + width * 0.5,
        offsetY + height * 0.5,
        offsetY - height * 0.5,
        near,
        far
      );
    } else {
      const safeVerticalAperture = Math.max(Number.EPSILON, verticalAperture);
      const safeFocalLength = Math.max(Number.EPSILON, focalLength);
      const aspect = horizontalAperture / safeVerticalAperture;
      const fov = 2 * Math.atan(safeVerticalAperture / (2 * safeFocalLength)) * 180 / Math.PI;
      camera = new PerspectiveCamera(fov, aspect, near, far);
      camera.filmGauge = Math.max(horizontalAperture, verticalAperture);
      camera.filmOffset = horizontalApertureOffset;
      camera.focus = focusDistance;
      camera.setFocalLength(safeFocalLength);
      if (verticalApertureOffset !== 0) {
        camera.userData.verticalApertureOffset = verticalApertureOffset;
      }
    }
    camera.userData.fStop = fStop;
    camera.userData.usdProjection = projection;
    return camera;
  }
  /**
   * Build a light from a UsdLux light spec.
   */
  _buildLight(path, typeName) {
    const attrs = this._getAttributes(path);
    const intensity = this._parseNumber(attrs["inputs:intensity"], 1);
    const baseColor = attrs["inputs:color"] || [1, 1, 1];
    const enableColorTemperature = attrs["inputs:enableColorTemperature"] === true;
    const colorTemperature = this._parseNumber(attrs["inputs:colorTemperature"], 6500);
    const color = new Color(baseColor[0], baseColor[1], baseColor[2]);
    if (enableColorTemperature) {
      const temp = this._colorTemperature(colorTemperature);
      color.multiply(temp);
    }
    let light;
    switch (typeName) {
      case "DistantLight":
        light = new DirectionalLight(color, intensity);
        break;
      case "SphereLight": {
        const coneAngle = this._parseNumber(attrs["shaping:cone:angle"], 0);
        if (coneAngle > 0) {
          const angle = coneAngle * Math.PI / 180;
          const softness = this._parseNumber(attrs["shaping:cone:softness"], 0);
          light = new SpotLight(color, intensity, 0, angle, softness);
        } else {
          light = new PointLight(color, intensity);
        }
        break;
      }
      case "RectLight": {
        const width = this._parseNumber(attrs["inputs:width"], 1);
        const height = this._parseNumber(attrs["inputs:height"], 1);
        light = new RectAreaLight(color, intensity, width, height);
        break;
      }
      case "DiskLight": {
        const radius = this._parseNumber(attrs["inputs:radius"], 0.5);
        const side = radius * 2;
        light = new RectAreaLight(color, intensity, side, side);
        break;
      }
    }
    return light;
  }
  /**
   * Convert a color temperature in Kelvin to an RGB Color.
   * Based on Tanner Helland's algorithm.
   */
  _colorTemperature(kelvin) {
    const temp = kelvin / 100;
    let r, g, b;
    if (temp <= 66) {
      r = 1;
      g = 0.3900815787690196 * Math.log(temp) - 0.6318414437886275;
    } else {
      r = 1.292936186062745 * Math.pow(temp - 60, -0.1332047592);
      g = 1.1298908608952942 * Math.pow(temp - 60, -0.0755148492);
    }
    if (temp >= 66) {
      b = 1;
    } else if (temp <= 19) {
      b = 0;
    } else {
      b = 0.543206789110196 * Math.log(temp - 10) - 1.19625408914;
    }
    return new Color(
      Math.min(Math.max(r, 0), 1),
      Math.min(Math.max(g, 0), 1),
      Math.min(Math.max(b, 0), 1)
    );
  }
  _parseNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  _getGeomSubsets(meshPath) {
    const subsets = [];
    const subsetPaths = this.geomSubsetsByMeshPath.get(meshPath);
    if (!subsetPaths) return subsets;
    for (const p of subsetPaths) {
      const attrs = this._getAttributes(p);
      const indices = attrs["indices"];
      if (!indices || indices.length === 0) continue;
      const materialPath = this._getMaterialBindingTarget(p);
      subsets.push({
        name: p.split("/").pop(),
        indices,
        materialPath
      });
    }
    return subsets;
  }
  /**
   * Get material binding target path, checking variant paths if needed.
   */
  _getMaterialBindingTarget(primPath) {
    var _a, _b, _c, _d;
    const attrName = "material:binding";
    const directPath = primPath + "." + attrName;
    const directSpec = this.specsByPath[directPath];
    if (((_b = (_a = directSpec == null ? void 0 : directSpec.fields) == null ? void 0 : _a.targetPaths) == null ? void 0 : _b.length) > 0) {
      return directSpec.fields.targetPaths[0];
    }
    const parts = primPath.split("/");
    for (let i = 1; i < parts.length; i++) {
      const ancestorPath = parts.slice(0, i + 1).join("/");
      const relativePath = parts.slice(i + 1).join("/");
      const variantPaths = this._getVariantPaths(ancestorPath);
      for (const vp of variantPaths) {
        const overridePath = relativePath ? vp + "/" + relativePath + "." + attrName : vp + "." + attrName;
        const overrideSpec = this.specsByPath[overridePath];
        if (((_d = (_c = overrideSpec == null ? void 0 : overrideSpec.fields) == null ? void 0 : _c.targetPaths) == null ? void 0 : _d.length) > 0) {
          return overrideSpec.fields.targetPaths[0];
        }
      }
    }
    return null;
  }
  _buildGeometry(path, fields, hasSkinning = false) {
    const geometry = new BufferGeometry();
    const points = fields["points"];
    if (!points || points.length === 0) return geometry;
    const faceVertexIndices = fields["faceVertexIndices"];
    const faceVertexCounts = fields["faceVertexCounts"];
    const polygonHoles = fields["primvars:arnold:polygon_holes"];
    const holeMap = this._buildHoleMap(polygonHoles);
    let indices = faceVertexIndices;
    let triPattern = null;
    if (faceVertexCounts && faceVertexCounts.length > 0) {
      const result = this._triangulateIndicesWithPattern(faceVertexIndices, faceVertexCounts, points, holeMap);
      indices = result.indices;
      triPattern = result.pattern;
    }
    let positions = points;
    if (indices && indices.length > 0) {
      positions = this._expandAttribute(points, indices, 3);
    }
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    const normals = fields["normals"] || fields["primvars:normals"];
    const normalIndicesRaw = fields["normals:indices"] || fields["primvars:normals:indices"];
    if (normals && normals.length > 0) {
      let normalData = normals;
      if (normalIndicesRaw && normalIndicesRaw.length > 0 && triPattern) {
        const triangulatedNormalIndices = this._applyTriangulationPattern(normalIndicesRaw, triPattern);
        normalData = this._expandAttribute(normals, triangulatedNormalIndices, 3);
      } else if (normals.length === points.length) {
        if (indices && indices.length > 0) {
          normalData = this._expandAttribute(normals, indices, 3);
        }
      } else if (triPattern) {
        const normalIndices = this._applyTriangulationPattern(
          Array.from({ length: normals.length / 3 }, (_, i) => i),
          triPattern
        );
        normalData = this._expandAttribute(normals, normalIndices, 3);
      }
      geometry.setAttribute("normal", new BufferAttribute(new Float32Array(normalData), 3));
    } else {
      const vertexNormals = this._computeVertexNormals(points, indices);
      geometry.setAttribute("normal", new BufferAttribute(new Float32Array(
        this._expandAttribute(vertexNormals, indices, 3)
      ), 3));
    }
    const { uvs, uvIndices } = this._findUVPrimvar(fields);
    const numFaceVertices = faceVertexIndices ? faceVertexIndices.length : 0;
    if (uvs && uvs.length > 0) {
      let uvData = uvs;
      if (uvIndices && uvIndices.length > 0 && triPattern) {
        const triangulatedUvIndices = this._applyTriangulationPattern(uvIndices, triPattern);
        uvData = this._expandAttribute(uvs, triangulatedUvIndices, 2);
      } else if (indices && uvs.length / 2 === points.length / 3) {
        uvData = this._expandAttribute(uvs, indices, 2);
      } else if (triPattern && uvs.length / 2 === numFaceVertices) {
        const uvIndicesFromPattern = this._applyTriangulationPattern(
          Array.from({ length: numFaceVertices }, (_, i) => i),
          triPattern
        );
        uvData = this._expandAttribute(uvs, uvIndicesFromPattern, 2);
      }
      geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvData), 2));
    }
    const { uvs2, uv2Indices } = this._findUV2Primvar(fields);
    if (uvs2 && uvs2.length > 0) {
      let uv2Data = uvs2;
      if (uv2Indices && uv2Indices.length > 0 && triPattern) {
        const triangulatedUv2Indices = this._applyTriangulationPattern(uv2Indices, triPattern);
        uv2Data = this._expandAttribute(uvs2, triangulatedUv2Indices, 2);
      } else if (indices && uvs2.length / 2 === points.length / 3) {
        uv2Data = this._expandAttribute(uvs2, indices, 2);
      } else if (triPattern && uvs2.length / 2 === numFaceVertices) {
        const uv2IndicesFromPattern = this._applyTriangulationPattern(
          Array.from({ length: numFaceVertices }, (_, i) => i),
          triPattern
        );
        uv2Data = this._expandAttribute(uvs2, uv2IndicesFromPattern, 2);
      }
      geometry.setAttribute("uv1", new BufferAttribute(new Float32Array(uv2Data), 2));
    }
    if (hasSkinning) {
      const jointIndices = fields["primvars:skel:jointIndices"];
      const jointWeights = fields["primvars:skel:jointWeights"];
      const elementSize = fields["primvars:skel:jointIndices:elementSize"] || 4;
      if (jointIndices && jointWeights) {
        const numVertices = positions.length / 3;
        let skinIndexData, skinWeightData;
        if (indices && indices.length > 0) {
          skinIndexData = this._expandAttribute(jointIndices, indices, elementSize);
          skinWeightData = this._expandAttribute(jointWeights, indices, elementSize);
        } else {
          skinIndexData = jointIndices;
          skinWeightData = jointWeights;
        }
        const skinIndices = new Uint16Array(numVertices * 4);
        const skinWeights = new Float32Array(numVertices * 4);
        this._selectTopWeights(skinIndexData, skinWeightData, elementSize, numVertices, skinIndices, skinWeights);
        geometry.setAttribute("skinIndex", new BufferAttribute(skinIndices, 4));
        geometry.setAttribute("skinWeight", new BufferAttribute(skinWeights, 4));
      }
    }
    return geometry;
  }
  _buildGeometryWithSubsets(fields, geomSubsets, hasSkinning = false) {
    const geometry = new BufferGeometry();
    const points = fields["points"];
    if (!points || points.length === 0) return geometry;
    const faceVertexIndices = fields["faceVertexIndices"];
    const faceVertexCounts = fields["faceVertexCounts"];
    if (!faceVertexCounts || faceVertexCounts.length === 0) return geometry;
    const polygonHoles = fields["primvars:arnold:polygon_holes"];
    const holeMap = this._buildHoleMap(polygonHoles);
    const holeFaces = holeMap.holeFaces;
    const parentToHoles = holeMap.parentToHoles;
    const { uvs, uvIndices } = this._findUVPrimvar(fields);
    const { uvs2, uv2Indices } = this._findUV2Primvar(fields);
    const normals = fields["normals"] || fields["primvars:normals"];
    const normalIndicesRaw = fields["normals:indices"] || fields["primvars:normals:indices"];
    const jointIndices = hasSkinning ? fields["primvars:skel:jointIndices"] : null;
    const jointWeights = hasSkinning ? fields["primvars:skel:jointWeights"] : null;
    const elementSize = fields["primvars:skel:jointIndices:elementSize"] || 4;
    const faceTriangleOffset = [];
    let triangleCount = 0;
    for (let i = 0; i < faceVertexCounts.length; i++) {
      faceTriangleOffset.push(triangleCount);
      if (holeFaces.has(i)) continue;
      const count = faceVertexCounts[i];
      const holes = parentToHoles.get(i);
      if (holes && holes.length > 0) {
        let totalVerts = count;
        for (const holeIdx of holes) {
          totalVerts += faceVertexCounts[holeIdx];
        }
        triangleCount += totalVerts - 2;
      } else if (count >= 3) {
        triangleCount += count - 2;
      }
    }
    const triangleToSubset = new Int32Array(triangleCount).fill(-1);
    for (let si = 0; si < geomSubsets.length; si++) {
      const subset = geomSubsets[si];
      for (let i = 0; i < subset.indices.length; i++) {
        const faceIdx = subset.indices[i];
        if (faceIdx >= faceVertexCounts.length) continue;
        const triStart = faceTriangleOffset[faceIdx];
        const triCount = faceVertexCounts[faceIdx] - 2;
        for (let t = 0; t < triCount; t++) {
          triangleToSubset[triStart + t] = si;
        }
      }
    }
    const sortedTriangles = [];
    for (let tri = 0; tri < triangleCount; tri++) {
      sortedTriangles.push({ original: tri, subset: triangleToSubset[tri] });
    }
    sortedTriangles.sort((a, b) => a.subset - b.subset);
    const groups = [];
    let currentSubset = sortedTriangles.length > 0 ? sortedTriangles[0].subset : -1;
    let groupStart = 0;
    for (let i = 0; i < sortedTriangles.length; i++) {
      if (sortedTriangles[i].subset !== currentSubset) {
        if (currentSubset >= 0) {
          groups.push({
            start: groupStart * 3,
            count: (i - groupStart) * 3,
            materialIndex: currentSubset
          });
        }
        currentSubset = sortedTriangles[i].subset;
        groupStart = i;
      }
    }
    if (currentSubset >= 0 && sortedTriangles.length > groupStart) {
      groups.push({
        start: groupStart * 3,
        count: (sortedTriangles.length - groupStart) * 3,
        materialIndex: currentSubset
      });
    }
    for (const group of groups) {
      geometry.addGroup(group.start, group.count, group.materialIndex);
    }
    const { indices: origIndices, pattern: triPattern } = this._triangulateIndicesWithPattern(faceVertexIndices, faceVertexCounts, points, holeMap);
    const numFaceVertices = faceVertexCounts.reduce((a, b) => a + b, 0);
    const faceVaryingIdentity = uvs && !uvIndices && uvs.length / 2 === numFaceVertices || uvs2 && !uv2Indices && uvs2.length / 2 === numFaceVertices ? this._applyTriangulationPattern(Array.from({ length: numFaceVertices }, (_, i) => i), triPattern) : null;
    const origUvIndices = uvIndices ? this._applyTriangulationPattern(uvIndices, triPattern) : uvs && uvs.length / 2 === numFaceVertices ? faceVaryingIdentity : null;
    const origUv2Indices = uv2Indices ? this._applyTriangulationPattern(uv2Indices, triPattern) : uvs2 && uvs2.length / 2 === numFaceVertices ? faceVaryingIdentity : null;
    const hasIndexedNormals = normals && normalIndicesRaw && normalIndicesRaw.length > 0;
    const hasFaceVaryingNormals = normals && normals.length / 3 === numFaceVertices;
    const origNormalIndices = hasIndexedNormals ? this._applyTriangulationPattern(normalIndicesRaw, triPattern) : hasFaceVaryingNormals ? this._applyTriangulationPattern(Array.from({ length: numFaceVertices }, (_, i) => i), triPattern) : null;
    const vertexNormals = !normals && origIndices.length > 0 ? this._computeVertexNormals(points, origIndices) : null;
    const vertexCount = triangleCount * 3;
    const positions = new Float32Array(vertexCount * 3);
    const uvData = uvs ? new Float32Array(vertexCount * 2) : null;
    const uv1Data = uvs2 ? new Float32Array(vertexCount * 2) : null;
    const normalData = normals || vertexNormals ? new Float32Array(vertexCount * 3) : null;
    const skinSrcIndices = jointIndices ? new Uint16Array(vertexCount * elementSize) : null;
    const skinSrcWeights = jointWeights ? new Float32Array(vertexCount * elementSize) : null;
    for (let i = 0; i < sortedTriangles.length; i++) {
      const origTri = sortedTriangles[i].original;
      for (let v = 0; v < 3; v++) {
        const origIdx = origTri * 3 + v;
        const newIdx = i * 3 + v;
        const pointIdx = origIndices[origIdx];
        positions[newIdx * 3] = points[pointIdx * 3];
        positions[newIdx * 3 + 1] = points[pointIdx * 3 + 1];
        positions[newIdx * 3 + 2] = points[pointIdx * 3 + 2];
        if (uvData && uvs) {
          if (origUvIndices) {
            const uvIdx = origUvIndices[origIdx];
            uvData[newIdx * 2] = uvs[uvIdx * 2];
            uvData[newIdx * 2 + 1] = uvs[uvIdx * 2 + 1];
          } else if (uvs.length / 2 === points.length / 3) {
            uvData[newIdx * 2] = uvs[pointIdx * 2];
            uvData[newIdx * 2 + 1] = uvs[pointIdx * 2 + 1];
          }
        }
        if (uv1Data && uvs2) {
          if (origUv2Indices) {
            const uv2Idx = origUv2Indices[origIdx];
            uv1Data[newIdx * 2] = uvs2[uv2Idx * 2];
            uv1Data[newIdx * 2 + 1] = uvs2[uv2Idx * 2 + 1];
          } else if (uvs2.length / 2 === points.length / 3) {
            uv1Data[newIdx * 2] = uvs2[pointIdx * 2];
            uv1Data[newIdx * 2 + 1] = uvs2[pointIdx * 2 + 1];
          }
        }
        if (normalData) {
          if (normals && origNormalIndices) {
            const normalIdx = origNormalIndices[origIdx];
            normalData[newIdx * 3] = normals[normalIdx * 3];
            normalData[newIdx * 3 + 1] = normals[normalIdx * 3 + 1];
            normalData[newIdx * 3 + 2] = normals[normalIdx * 3 + 2];
          } else if (normals && normals.length === points.length) {
            normalData[newIdx * 3] = normals[pointIdx * 3];
            normalData[newIdx * 3 + 1] = normals[pointIdx * 3 + 1];
            normalData[newIdx * 3 + 2] = normals[pointIdx * 3 + 2];
          } else if (vertexNormals) {
            normalData[newIdx * 3] = vertexNormals[pointIdx * 3];
            normalData[newIdx * 3 + 1] = vertexNormals[pointIdx * 3 + 1];
            normalData[newIdx * 3 + 2] = vertexNormals[pointIdx * 3 + 2];
          }
        }
        if (skinSrcIndices && skinSrcWeights && jointIndices && jointWeights) {
          for (let j = 0; j < elementSize; j++) {
            skinSrcIndices[newIdx * elementSize + j] = jointIndices[pointIdx * elementSize + j] || 0;
            skinSrcWeights[newIdx * elementSize + j] = jointWeights[pointIdx * elementSize + j] || 0;
          }
        }
      }
    }
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    if (uvData) {
      geometry.setAttribute("uv", new BufferAttribute(uvData, 2));
    }
    if (uv1Data) {
      geometry.setAttribute("uv1", new BufferAttribute(uv1Data, 2));
    }
    geometry.setAttribute("normal", new BufferAttribute(normalData, 3));
    if (skinSrcIndices && skinSrcWeights) {
      const skinIndexData = new Uint16Array(vertexCount * 4);
      const skinWeightData = new Float32Array(vertexCount * 4);
      this._selectTopWeights(skinSrcIndices, skinSrcWeights, elementSize, vertexCount, skinIndexData, skinWeightData);
      geometry.setAttribute("skinIndex", new BufferAttribute(skinIndexData, 4));
      geometry.setAttribute("skinWeight", new BufferAttribute(skinWeightData, 4));
    }
    return geometry;
  }
  _selectTopWeights(srcIndices, srcWeights, elementSize, numVertices, dstIndices, dstWeights) {
    if (elementSize <= 4) {
      for (let i = 0; i < numVertices; i++) {
        for (let j = 0; j < 4; j++) {
          if (j < elementSize) {
            dstIndices[i * 4 + j] = srcIndices[i * elementSize + j] || 0;
            dstWeights[i * 4 + j] = srcWeights[i * elementSize + j] || 0;
          } else {
            dstIndices[i * 4 + j] = 0;
            dstWeights[i * 4 + j] = 0;
          }
        }
      }
      return;
    }
    const order = new Uint32Array(elementSize);
    for (let i = 0; i < numVertices; i++) {
      const base = i * elementSize;
      for (let j = 0; j < elementSize; j++) order[j] = j;
      for (let k = 0; k < 4; k++) {
        let maxIdx = k;
        let maxW = srcWeights[base + order[k]] || 0;
        for (let j = k + 1; j < elementSize; j++) {
          const w = srcWeights[base + order[j]] || 0;
          if (w > maxW) {
            maxW = w;
            maxIdx = j;
          }
        }
        if (maxIdx !== k) {
          const tmp = order[k];
          order[k] = order[maxIdx];
          order[maxIdx] = tmp;
        }
      }
      let total = 0;
      for (let j = 0; j < 4; j++) {
        total += srcWeights[base + order[j]] || 0;
      }
      for (let j = 0; j < 4; j++) {
        const s = order[j];
        if (total > 0) {
          dstIndices[i * 4 + j] = srcIndices[base + s] || 0;
          dstWeights[i * 4 + j] = (srcWeights[base + s] || 0) / total;
        } else {
          dstIndices[i * 4 + j] = 0;
          dstWeights[i * 4 + j] = 0;
        }
      }
    }
  }
  _findUVPrimvar(fields) {
    for (const key in fields) {
      if (!key.startsWith("primvars:")) continue;
      if (key.endsWith(":typeName") || key.endsWith(":elementSize") || key.endsWith(":indices")) continue;
      if (key.includes("skel:")) continue;
      const typeName = fields[key + ":typeName"];
      if (typeName && typeName.includes("texCoord")) {
        return {
          uvs: fields[key],
          uvIndices: fields[key + ":indices"]
        };
      }
    }
    const uvs = fields["primvars:st"] || fields["primvars:UVMap"];
    const uvIndices = fields["primvars:st:indices"];
    return { uvs, uvIndices };
  }
  _findUV2Primvar(fields) {
    const uvs2 = fields["primvars:st1"];
    const uv2Indices = fields["primvars:st1:indices"];
    return { uvs2, uv2Indices };
  }
  _buildHoleMap(polygonHoles) {
    if (!polygonHoles || polygonHoles.length === 0) {
      return { parentToHoles: /* @__PURE__ */ new Map(), holeFaces: /* @__PURE__ */ new Set() };
    }
    const parentToHoles = /* @__PURE__ */ new Map();
    const holeFaces = /* @__PURE__ */ new Set();
    for (let i = 0; i < polygonHoles.length; i += 2) {
      const holeFaceIdx = polygonHoles[i];
      const parentFaceIdx = polygonHoles[i + 1];
      holeFaces.add(holeFaceIdx);
      if (!parentToHoles.has(parentFaceIdx)) {
        parentToHoles.set(parentFaceIdx, []);
      }
      parentToHoles.get(parentFaceIdx).push(holeFaceIdx);
    }
    return { parentToHoles, holeFaces };
  }
  _triangulateIndicesWithPattern(indices, counts, points = null, holeMap = null) {
    const triangulated = [];
    const pattern = [];
    const faceOffsets = [];
    let offsetAccum = 0;
    for (let i = 0; i < counts.length; i++) {
      faceOffsets.push(offsetAccum);
      offsetAccum += counts[i];
    }
    const parentToHoles = (holeMap == null ? void 0 : holeMap.parentToHoles) || /* @__PURE__ */ new Map();
    const holeFaces = (holeMap == null ? void 0 : holeMap.holeFaces) || /* @__PURE__ */ new Set();
    let offset = 0;
    for (let i = 0; i < counts.length; i++) {
      const count = counts[i];
      if (holeFaces.has(i)) {
        offset += count;
        continue;
      }
      const holes = parentToHoles.get(i);
      if (holes && holes.length > 0 && points && points.length > 0) {
        const vertexToFaceVertex = /* @__PURE__ */ new Map();
        const faceIndices = [];
        for (let j = 0; j < count; j++) {
          const vertIdx = indices[offset + j];
          faceIndices.push(vertIdx);
          vertexToFaceVertex.set(vertIdx, offset + j);
        }
        const holeContours = [];
        for (const holeFaceIdx of holes) {
          const holeOffset = faceOffsets[holeFaceIdx];
          const holeCount = counts[holeFaceIdx];
          const holeIndices = [];
          for (let j = 0; j < holeCount; j++) {
            const vertIdx = indices[holeOffset + j];
            holeIndices.push(vertIdx);
            vertexToFaceVertex.set(vertIdx, holeOffset + j);
          }
          holeContours.push(holeIndices);
        }
        const triangles = this._triangulateNGonWithHoles(faceIndices, holeContours, points);
        for (const tri of triangles) {
          triangulated.push(tri[0], tri[1], tri[2]);
          pattern.push(
            vertexToFaceVertex.get(tri[0]),
            vertexToFaceVertex.get(tri[1]),
            vertexToFaceVertex.get(tri[2])
          );
        }
      } else if (count === 3) {
        triangulated.push(
          indices[offset],
          indices[offset + 1],
          indices[offset + 2]
        );
        pattern.push(offset, offset + 1, offset + 2);
      } else if (count === 4) {
        triangulated.push(
          indices[offset],
          indices[offset + 1],
          indices[offset + 2],
          indices[offset],
          indices[offset + 2],
          indices[offset + 3]
        );
        pattern.push(
          offset,
          offset + 1,
          offset + 2,
          offset,
          offset + 2,
          offset + 3
        );
      } else if (count > 4) {
        if (points && points.length > 0) {
          const faceIndices = [];
          for (let j = 0; j < count; j++) {
            faceIndices.push(indices[offset + j]);
          }
          const triangles = this._triangulateNGon(faceIndices, points);
          for (const tri of triangles) {
            triangulated.push(tri[0], tri[1], tri[2]);
            pattern.push(
              offset + faceIndices.indexOf(tri[0]),
              offset + faceIndices.indexOf(tri[1]),
              offset + faceIndices.indexOf(tri[2])
            );
          }
        } else {
          for (let j = 1; j < count - 1; j++) {
            triangulated.push(
              indices[offset],
              indices[offset + j],
              indices[offset + j + 1]
            );
            pattern.push(offset, offset + j, offset + j + 1);
          }
        }
      }
      offset += count;
    }
    return { indices: triangulated, pattern };
  }
  _applyTriangulationPattern(indices, pattern) {
    const result = [];
    for (let i = 0; i < pattern.length; i++) {
      result.push(indices[pattern[i]]);
    }
    return result;
  }
  _triangulateNGon(faceIndices, points) {
    const contour2D = [];
    const contour3D = [];
    for (const idx of faceIndices) {
      contour3D.push(new Vector3(
        points[idx * 3],
        points[idx * 3 + 1],
        points[idx * 3 + 2]
      ));
    }
    const normal = new Vector3();
    for (let i = 0; i < contour3D.length; i++) {
      const curr = contour3D[i];
      const next = contour3D[(i + 1) % contour3D.length];
      normal.x += (curr.y - next.y) * (curr.z + next.z);
      normal.y += (curr.z - next.z) * (curr.x + next.x);
      normal.z += (curr.x - next.x) * (curr.y + next.y);
    }
    normal.normalize();
    const tangent = new Vector3();
    const bitangent = new Vector3();
    if (Math.abs(normal.y) > 0.9) {
      tangent.set(1, 0, 0);
    } else {
      tangent.set(0, 1, 0);
    }
    bitangent.crossVectors(normal, tangent).normalize();
    tangent.crossVectors(bitangent, normal).normalize();
    for (const p of contour3D) {
      contour2D.push(new Vector2(p.dot(tangent), p.dot(bitangent)));
    }
    const triangles = ShapeUtils.triangulateShape(contour2D, []);
    const result = [];
    for (const tri of triangles) {
      result.push([
        faceIndices[tri[0]],
        faceIndices[tri[1]],
        faceIndices[tri[2]]
      ]);
    }
    return result;
  }
  _triangulateNGonWithHoles(outerIndices, holeContours, points) {
    const outer3D = [];
    for (const idx of outerIndices) {
      outer3D.push(new Vector3(
        points[idx * 3],
        points[idx * 3 + 1],
        points[idx * 3 + 2]
      ));
    }
    const normal = new Vector3();
    for (let i = 0; i < outer3D.length; i++) {
      const curr = outer3D[i];
      const next = outer3D[(i + 1) % outer3D.length];
      normal.x += (curr.y - next.y) * (curr.z + next.z);
      normal.y += (curr.z - next.z) * (curr.x + next.x);
      normal.z += (curr.x - next.x) * (curr.y + next.y);
    }
    normal.normalize();
    const tangent = new Vector3();
    const bitangent = new Vector3();
    if (Math.abs(normal.y) > 0.9) {
      tangent.set(1, 0, 0);
    } else {
      tangent.set(0, 1, 0);
    }
    bitangent.crossVectors(normal, tangent).normalize();
    tangent.crossVectors(bitangent, normal).normalize();
    const outer2D = [];
    for (const p of outer3D) {
      outer2D.push(new Vector2(p.dot(tangent), p.dot(bitangent)));
    }
    const holes2D = [];
    for (const holeIndices of holeContours) {
      const hole2D = [];
      for (const idx of holeIndices) {
        const p = new Vector3(
          points[idx * 3],
          points[idx * 3 + 1],
          points[idx * 3 + 2]
        );
        hole2D.push(new Vector2(p.dot(tangent), p.dot(bitangent)));
      }
      holes2D.push(hole2D);
    }
    const allIndices = [...outerIndices];
    for (const holeIndices of holeContours) {
      allIndices.push(...holeIndices);
    }
    const triangles = ShapeUtils.triangulateShape(outer2D, holes2D);
    const result = [];
    for (const tri of triangles) {
      result.push([
        allIndices[tri[0]],
        allIndices[tri[1]],
        allIndices[tri[2]]
      ]);
    }
    return result;
  }
  _triangulateIndices(indices, counts) {
    const triangulated = [];
    let offset = 0;
    for (let i = 0; i < counts.length; i++) {
      const count = counts[i];
      if (count === 3) {
        triangulated.push(
          indices[offset],
          indices[offset + 1],
          indices[offset + 2]
        );
      } else if (count === 4) {
        triangulated.push(
          indices[offset],
          indices[offset + 1],
          indices[offset + 2],
          indices[offset],
          indices[offset + 2],
          indices[offset + 3]
        );
      } else if (count > 4) {
        for (let j = 1; j < count - 1; j++) {
          triangulated.push(
            indices[offset],
            indices[offset + j],
            indices[offset + j + 1]
          );
        }
      }
      offset += count;
    }
    return triangulated;
  }
  _expandAttribute(data, indices, itemSize) {
    const expanded = new Array(indices.length * itemSize);
    for (let i = 0; i < indices.length; i++) {
      const srcIdx = indices[i];
      for (let j = 0; j < itemSize; j++) {
        expanded[i * itemSize + j] = data[srcIdx * itemSize + j];
      }
    }
    return expanded;
  }
  /**
   * Compute per-vertex normals from indexed triangle data.
   * Accumulates area-weighted face normals at each shared vertex and normalizes.
   */
  _computeVertexNormals(points, indices) {
    const numVertices = points.length / 3;
    const normals = new Float32Array(numVertices * 3);
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i];
      const b = indices[i + 1];
      const c = indices[i + 2];
      const ax = points[a * 3], ay = points[a * 3 + 1], az = points[a * 3 + 2];
      const bx = points[b * 3], by = points[b * 3 + 1], bz = points[b * 3 + 2];
      const cx = points[c * 3], cy = points[c * 3 + 1], cz = points[c * 3 + 2];
      const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
      const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * e2y - e1y * e2x;
      normals[a * 3] += nx;
      normals[a * 3 + 1] += ny;
      normals[a * 3 + 2] += nz;
      normals[b * 3] += nx;
      normals[b * 3 + 1] += ny;
      normals[b * 3 + 2] += nz;
      normals[c * 3] += nx;
      normals[c * 3 + 1] += ny;
      normals[c * 3 + 2] += nz;
    }
    for (let i = 0; i < numVertices; i++) {
      const x = normals[i * 3], y = normals[i * 3 + 1], z = normals[i * 3 + 2];
      const len = Math.sqrt(x * x + y * y + z * z);
      if (len > 0) {
        normals[i * 3] /= len;
        normals[i * 3 + 1] /= len;
        normals[i * 3 + 2] /= len;
      }
    }
    return normals;
  }
  /**
   * Get the material path for a mesh, checking various binding sources.
   */
  _getMaterialPath(meshPath, fields) {
    let materialPath = null;
    const materialBinding = fields["material:binding"];
    if (materialBinding) {
      materialPath = Array.isArray(materialBinding) ? materialBinding[0] : materialBinding;
    }
    if (!materialPath) {
      materialPath = this._getMaterialBindingTarget(meshPath);
    }
    return materialPath;
  }
  _buildMaterial(meshPath, fields) {
    const material = new MeshPhysicalMaterial();
    let materialPath = null;
    const materialBinding = fields["material:binding"];
    if (materialBinding) {
      materialPath = Array.isArray(materialBinding) ? materialBinding[0] : materialBinding;
    }
    if (!materialPath) {
      materialPath = this._getMaterialBindingTarget(meshPath);
    }
    if (!materialPath) {
      const materialPaths = [];
      const prefix = meshPath + "/";
      for (const path in this.specsByPath) {
        if (!path.startsWith(prefix)) continue;
        if (!path.endsWith(".material:binding")) continue;
        const bindingSpec = this.specsByPath[path];
        if (!bindingSpec) continue;
        const targetPaths = bindingSpec.fields.targetPaths;
        if (targetPaths && targetPaths.length > 0) {
          materialPaths.push(targetPaths[0]);
        }
      }
      if (materialPaths.length > 0) {
        materialPath = this._pickBestMaterial(materialPaths);
      }
    }
    if (!materialPath) {
      const meshParts = meshPath.split("/");
      const rootPath = "/" + meshParts[1];
      const materialsInRoot = this.materialsByRoot.get(rootPath);
      if (materialsInRoot) {
        for (const path of materialsInRoot) {
          if (path.startsWith(rootPath + "/Looks/") || path.startsWith(rootPath + "/Materials/")) {
            materialPath = path;
            break;
          }
        }
      }
    }
    if (materialPath) {
      this._applyMaterial(material, materialPath);
    }
    return material;
  }
  _buildMaterialForPath(materialPath) {
    const material = new MeshPhysicalMaterial();
    if (materialPath) {
      this._applyMaterial(material, materialPath);
    }
    return material;
  }
  /**
   * Apply material binding from a prim path to a mesh.
   * Used when merging referenced geometry into a prim that has material binding.
   */
  _applyMaterialBinding(mesh, primPath) {
    var _a, _b;
    const bindingPath = primPath + ".material:binding";
    const bindingSpec = this.specsByPath[bindingPath];
    if (!bindingSpec) return;
    let materialPath = null;
    const targetPaths = ((_a = bindingSpec.fields) == null ? void 0 : _a.targetPaths) || ((_b = bindingSpec.fields) == null ? void 0 : _b.default);
    if (targetPaths) {
      materialPath = Array.isArray(targetPaths) ? targetPaths[0] : targetPaths;
    }
    if (!materialPath) return;
    materialPath = String(materialPath).replace(/^<|>$/g, "");
    const material = new MeshPhysicalMaterial();
    this._applyMaterial(material, materialPath);
    mesh.material = material;
  }
  _pickBestMaterial(materialPaths) {
    for (const materialPath of materialPaths) {
      const shaderPaths = this.shadersByMaterialPath.get(materialPath);
      if (!shaderPaths) continue;
      for (const path of shaderPaths) {
        const attrs = this._getAttributes(path);
        if (attrs["info:id"] === "UsdUVTexture" && attrs["inputs:file"]) {
          return materialPath;
        }
      }
    }
    return materialPaths[0];
  }
  _applyMaterial(material, materialPath) {
    const materialSpec = this.specsByPath[materialPath];
    if (!materialSpec) return;
    const shaderPaths = this.shadersByMaterialPath.get(materialPath);
    if (!shaderPaths) return;
    for (const path of shaderPaths) {
      const spec = this.specsByPath[path];
      if (!spec) continue;
      const shaderAttrs = this._getAttributes(path);
      const infoId = shaderAttrs["info:id"] || spec.fields["info:id"];
      if (infoId === "UsdPreviewSurface" || infoId === "ND_UsdPreviewSurface_surfaceshader") {
        this._applyPreviewSurface(material, path);
      } else if (infoId === "arnold:openpbr_surface") {
        this._applyOpenPBRSurface(material, path);
      }
    }
  }
  /**
   * Shared helper for applying texture or value from shader attribute.
   * Reduces duplication between _applyPreviewSurface and _applyOpenPBRSurface.
   */
  _applyTextureOrValue(material, shaderPath, fields, attrName, textureProperty, colorSpace, valueCallback, textureGetter) {
    const attrPath = shaderPath + "." + attrName;
    const spec = this.specsByPath[attrPath];
    if (spec && spec.fields.connectionPaths && spec.fields.connectionPaths.length > 0) {
      const paths = textureGetter === this._getTextureFromOpenPBRConnection ? spec.fields.connectionPaths : [spec.fields.connectionPaths[0]];
      for (const connPath of paths) {
        const texture = textureGetter.call(this, connPath);
        if (texture) {
          texture.colorSpace = colorSpace;
          material[textureProperty] = texture;
          return true;
        }
      }
    }
    if (fields[attrName] !== void 0 && valueCallback) {
      valueCallback(fields[attrName]);
    }
    return false;
  }
  _applyPreviewSurface(material, shaderPath) {
    var _a, _b;
    const fields = this._getAttributes(shaderPath);
    const applyTexture = (attrName, textureProperty, colorSpace, valueCallback) => {
      return this._applyTextureOrValue(
        material,
        shaderPath,
        fields,
        attrName,
        textureProperty,
        colorSpace,
        valueCallback,
        this._getTextureFromConnection
      );
    };
    const getAttrSpec = (attrName) => {
      const attrPath = shaderPath + "." + attrName;
      return this.specsByPath[attrPath];
    };
    applyTexture(
      "inputs:diffuseColor",
      "map",
      SRGBColorSpace,
      (color) => {
        if (Array.isArray(color) && color.length >= 3) {
          material.color.setRGB(color[0], color[1], color[2], SRGBColorSpace);
        }
      }
    );
    if (material.map && material.map.userData.scale) {
      const scale = material.map.userData.scale;
      if (Array.isArray(scale) && scale.length >= 3) {
        material.color.setRGB(scale[0], scale[1], scale[2], SRGBColorSpace);
      }
    }
    applyTexture(
      "inputs:emissiveColor",
      "emissiveMap",
      SRGBColorSpace,
      (color) => {
        if (Array.isArray(color) && color.length >= 3) {
          material.emissive.setRGB(color[0], color[1], color[2], SRGBColorSpace);
        }
      }
    );
    if (material.emissiveMap) {
      if (material.emissiveMap.userData.scale) {
        const scale = material.emissiveMap.userData.scale;
        if (Array.isArray(scale) && scale.length >= 3) {
          material.emissive.setRGB(scale[0], scale[1], scale[2], SRGBColorSpace);
        }
      } else {
        material.emissive.set(16777215);
      }
    }
    applyTexture("inputs:normal", "normalMap", NoColorSpace, null);
    if (material.normalMap && material.normalMap.userData.scale) {
      const scale = material.normalMap.userData.scale;
      material.normalScale = new Vector2(scale[0], scale[1]);
    }
    const hasRoughnessMap = applyTexture(
      "inputs:roughness",
      "roughnessMap",
      NoColorSpace,
      (value) => {
        material.roughness = value;
      }
    );
    if (hasRoughnessMap) {
      material.roughness = 1;
    }
    const hasMetalnessMap = applyTexture(
      "inputs:metallic",
      "metalnessMap",
      NoColorSpace,
      (value) => {
        material.metalness = value;
      }
    );
    if (hasMetalnessMap) {
      material.metalness = 1;
    }
    applyTexture("inputs:occlusion", "aoMap", NoColorSpace, null);
    if (fields["inputs:ior"] !== void 0) {
      material.ior = fields["inputs:ior"];
    }
    applyTexture(
      "inputs:specularColor",
      "specularColorMap",
      SRGBColorSpace,
      (color) => {
        if (Array.isArray(color) && color.length >= 3) {
          material.specularColor.setRGB(color[0], color[1], color[2], SRGBColorSpace);
        }
      }
    );
    if (material.specularColorMap && material.specularColorMap.userData.scale) {
      const scale = material.specularColorMap.userData.scale;
      if (Array.isArray(scale) && scale.length >= 3) {
        material.specularColor.setRGB(scale[0], scale[1], scale[2], SRGBColorSpace);
      }
    }
    if (fields["inputs:clearcoat"] !== void 0) {
      material.clearcoat = fields["inputs:clearcoat"];
    }
    if (fields["inputs:clearcoatRoughness"] !== void 0) {
      material.clearcoatRoughness = fields["inputs:clearcoatRoughness"];
    }
    const opacityThreshold = fields["inputs:opacityThreshold"] !== void 0 ? fields["inputs:opacityThreshold"] : 0;
    const opacitySpec = getAttrSpec("inputs:opacity");
    const hasOpacityConnection = ((_b = (_a = opacitySpec == null ? void 0 : opacitySpec.fields) == null ? void 0 : _a.connectionPaths) == null ? void 0 : _b.length) > 0;
    if (hasOpacityConnection) {
      if (opacityThreshold > 0) {
        material.alphaTest = opacityThreshold;
        material.transparent = false;
      } else {
        material.transparent = true;
      }
    } else {
      const opacity = fields["inputs:opacity"] !== void 0 ? fields["inputs:opacity"] : 1;
      if (opacity < 1) {
        material.transparent = true;
        material.opacity = opacity;
      }
    }
  }
  _applyOpenPBRSurface(material, shaderPath) {
    const fields = this._getAttributes(shaderPath);
    const applyTexture = (attrName, textureProperty, colorSpace, valueCallback) => {
      return this._applyTextureOrValue(
        material,
        shaderPath,
        fields,
        attrName,
        textureProperty,
        colorSpace,
        valueCallback,
        this._getTextureFromOpenPBRConnection
      );
    };
    applyTexture(
      "inputs:base_color",
      "map",
      SRGBColorSpace,
      (color) => {
        if (Array.isArray(color) && color.length >= 3) {
          material.color.setRGB(color[0], color[1], color[2], SRGBColorSpace);
        }
      }
    );
    if (material.map && material.map.userData.scale) {
      const scale = material.map.userData.scale;
      if (Array.isArray(scale) && scale.length >= 3) {
        material.color.setRGB(scale[0], scale[1], scale[2], SRGBColorSpace);
      }
    }
    applyTexture(
      "inputs:base_metalness",
      "metalnessMap",
      NoColorSpace,
      (value) => {
        if (typeof value === "number") {
          material.metalness = value;
        }
      }
    );
    applyTexture(
      "inputs:specular_roughness",
      "roughnessMap",
      NoColorSpace,
      (value) => {
        if (typeof value === "number") {
          material.roughness = value;
        }
      }
    );
    const hasEmissionMap = applyTexture(
      "inputs:emission_color",
      "emissiveMap",
      SRGBColorSpace,
      (color) => {
        if (Array.isArray(color) && color.length >= 3) {
          material.emissive.setRGB(color[0], color[1], color[2], SRGBColorSpace);
        }
      }
    );
    const emissionLuminance = fields["inputs:emission_luminance"];
    if (emissionLuminance !== void 0 && emissionLuminance > 0) {
      if (hasEmissionMap) {
        material.emissiveIntensity = emissionLuminance;
      } else {
        material.emissive.multiplyScalar(emissionLuminance);
      }
    }
    const transmissionWeight = fields["inputs:transmission_weight"];
    if (transmissionWeight !== void 0 && transmissionWeight > 0) {
      material.transmission = transmissionWeight;
      const transmissionDepth = fields["inputs:transmission_depth"];
      if (transmissionDepth !== void 0) {
        material.thickness = transmissionDepth;
      }
      const transmissionColor = fields["inputs:transmission_color"];
      if (transmissionColor !== void 0 && Array.isArray(transmissionColor)) {
        material.attenuationColor.setRGB(transmissionColor[0], transmissionColor[1], transmissionColor[2]);
        material.attenuationDistance = transmissionDepth || 1;
      }
    }
    const geometryOpacity = fields["inputs:geometry_opacity"];
    if (geometryOpacity !== void 0 && geometryOpacity < 1) {
      material.opacity = geometryOpacity;
      material.transparent = true;
    }
    const specularIOR = fields["inputs:specular_ior"];
    if (specularIOR !== void 0) {
      material.ior = specularIOR;
    }
    const coatWeight = fields["inputs:coat_weight"];
    if (coatWeight !== void 0 && coatWeight > 0) {
      material.clearcoat = coatWeight;
      const coatRoughness = fields["inputs:coat_roughness"];
      if (coatRoughness !== void 0) {
        material.clearcoatRoughness = coatRoughness;
      }
    }
    const thinFilmWeight = fields["inputs:thin_film_weight"];
    if (thinFilmWeight !== void 0 && thinFilmWeight > 0) {
      material.iridescence = thinFilmWeight;
      const thinFilmIOR = fields["inputs:thin_film_ior"];
      if (thinFilmIOR !== void 0) {
        material.iridescenceIOR = thinFilmIOR;
      }
      const thinFilmThickness = fields["inputs:thin_film_thickness"];
      if (thinFilmThickness !== void 0) {
        const thicknessNm = thinFilmThickness * 1e3;
        material.iridescenceThicknessRange = [thicknessNm, thicknessNm];
      }
    }
    const specularWeight = fields["inputs:specular_weight"];
    if (specularWeight !== void 0) {
      material.specularIntensity = specularWeight;
    }
    const specularColor = fields["inputs:specular_color"];
    if (specularColor !== void 0 && Array.isArray(specularColor)) {
      material.specularColor.setRGB(specularColor[0], specularColor[1], specularColor[2]);
    }
    const anisotropy = fields["inputs:specular_roughness_anisotropy"];
    if (anisotropy !== void 0 && anisotropy > 0) {
      material.anisotropy = anisotropy;
    }
    applyTexture(
      "inputs:geometry_normal",
      "normalMap",
      NoColorSpace,
      null
    );
  }
  _getTextureFromOpenPBRConnection(connPath) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    const cleanPath = connPath.replace(/<|>/g, "");
    const shaderPath = cleanPath.split(".")[0];
    const shaderSpec = this.specsByPath[shaderPath];
    if (!shaderSpec) return null;
    const attrs = this._getAttributes(shaderPath);
    const infoId = attrs["info:id"] || shaderSpec.fields["info:id"];
    const typeName = shaderSpec.fields.typeName;
    if (typeName === "NodeGraph") {
      const outputName = cleanPath.split(".")[1];
      const outputAttrPath = shaderPath + "." + outputName;
      const outputSpec = this.specsByPath[outputAttrPath];
      if (((_b = (_a = outputSpec == null ? void 0 : outputSpec.fields) == null ? void 0 : _a.connectionPaths) == null ? void 0 : _b.length) > 0) {
        return this._getTextureFromOpenPBRConnection(outputSpec.fields.connectionPaths[0]);
      }
      return null;
    }
    if (infoId === "arnold:image") {
      const filePath = attrs["inputs:filename"];
      if (!filePath) return null;
      return this._loadTextureFromPath(filePath);
    }
    if (infoId && infoId.startsWith("ND_image_")) {
      const filePath = attrs["inputs:file"];
      if (!filePath) return null;
      return this._loadTextureFromPath(filePath);
    }
    if (infoId === "MayaND_fileTexture_color4") {
      const inColorPath = shaderPath + ".inputs:inColor";
      const inColorSpec = this.specsByPath[inColorPath];
      if (((_d = (_c = inColorSpec == null ? void 0 : inColorSpec.fields) == null ? void 0 : _c.connectionPaths) == null ? void 0 : _d.length) > 0) {
        return this._getTextureFromOpenPBRConnection(inColorSpec.fields.connectionPaths[0]);
      }
      return null;
    }
    if (infoId && infoId.startsWith("ND_convert_")) {
      const inPath = shaderPath + ".inputs:in";
      const inSpec = this.specsByPath[inPath];
      if (((_f = (_e = inSpec == null ? void 0 : inSpec.fields) == null ? void 0 : _e.connectionPaths) == null ? void 0 : _f.length) > 0) {
        return this._getTextureFromOpenPBRConnection(inSpec.fields.connectionPaths[0]);
      }
      return null;
    }
    if (infoId === "arnold:bump2d") {
      const bumpMapPath = shaderPath + ".inputs:bump_map";
      const bumpMapSpec = this.specsByPath[bumpMapPath];
      if (((_h = (_g = bumpMapSpec == null ? void 0 : bumpMapSpec.fields) == null ? void 0 : _g.connectionPaths) == null ? void 0 : _h.length) > 0) {
        return this._getTextureFromOpenPBRConnection(bumpMapSpec.fields.connectionPaths[0]);
      }
      return null;
    }
    if (infoId === "arnold:color_correct") {
      const inputPath = shaderPath + ".inputs:input";
      const inputSpec = this.specsByPath[inputPath];
      if (((_j = (_i = inputSpec == null ? void 0 : inputSpec.fields) == null ? void 0 : _i.connectionPaths) == null ? void 0 : _j.length) > 0) {
        return this._getTextureFromOpenPBRConnection(inputSpec.fields.connectionPaths[0]);
      }
      return null;
    }
    const parentPath = shaderPath.substring(0, shaderPath.lastIndexOf("/"));
    if (parentPath) {
      const parentSpec = this.specsByPath[parentPath];
      if (parentSpec) {
        const parentAttrs = this._getAttributes(parentPath);
        const parentInfoId = parentAttrs["info:id"] || parentSpec.fields["info:id"];
        if (parentInfoId === "arnold:image") {
          const filePath = parentAttrs["inputs:filename"];
          if (filePath) return this._loadTextureFromPath(filePath);
        }
      }
    }
    return null;
  }
  _loadTextureFromPath(filePath) {
    if (!filePath) return null;
    if (this.textureCache[filePath]) {
      return this.textureCache[filePath];
    }
    const texture = this._loadTexture(filePath, null, null);
    if (texture) {
      this.textureCache[filePath] = texture;
    }
    return texture;
  }
  _getTextureFromConnection(connPath) {
    var _a, _b, _c, _d;
    const shaderPath = connPath.split(".")[0];
    const shaderSpec = this.specsByPath[shaderPath];
    if (!shaderSpec) return null;
    const attrs = this._getAttributes(shaderPath);
    const infoId = attrs["info:id"] || shaderSpec.fields["info:id"];
    if (infoId !== "UsdUVTexture") return null;
    const filePath = attrs["inputs:file"];
    if (!filePath) return null;
    let transformAttrs = null;
    let uvChannel = 0;
    const stAttrPath = shaderPath + ".inputs:st";
    const stAttrSpec = this.specsByPath[stAttrPath];
    if (((_b = (_a = stAttrSpec == null ? void 0 : stAttrSpec.fields) == null ? void 0 : _a.connectionPaths) == null ? void 0 : _b.length) > 0) {
      const stConnPath = stAttrSpec.fields.connectionPaths[0];
      const stPath = stConnPath.replace(/<|>/g, "").split(".")[0];
      const stSpec = this.specsByPath[stPath];
      if (stSpec) {
        const stAttrs = this._getAttributes(stPath);
        const stInfoId = stAttrs["info:id"] || stSpec.fields["info:id"];
        if (stInfoId === "UsdTransform2d") {
          transformAttrs = stAttrs;
          const inAttrPath = stPath + ".inputs:in";
          const inAttrSpec = this.specsByPath[inAttrPath];
          if (((_d = (_c = inAttrSpec == null ? void 0 : inAttrSpec.fields) == null ? void 0 : _c.connectionPaths) == null ? void 0 : _d.length) > 0) {
            const inConnPath = inAttrSpec.fields.connectionPaths[0];
            const primvarPath = inConnPath.replace(/<|>/g, "").split(".")[0];
            const primvarAttrs = this._getAttributes(primvarPath);
            const varname = primvarAttrs["inputs:varname"];
            if (varname === "st1") uvChannel = 1;
            else if (varname === "st2") uvChannel = 2;
          }
        } else if (stInfoId === "UsdPrimvarReader_float2") {
          const varname = stAttrs["inputs:varname"];
          if (varname === "st1") uvChannel = 1;
          else if (varname === "st2") uvChannel = 2;
        }
      }
    }
    const scale = attrs["inputs:scale"];
    const bias = attrs["inputs:bias"];
    let cacheKey = filePath;
    if (scale) cacheKey += ":s" + scale.join(",");
    if (bias) cacheKey += ":b" + bias.join(",");
    if (this.textureCache[cacheKey]) {
      return this.textureCache[cacheKey];
    }
    const texture = this._loadTexture(filePath, attrs, transformAttrs);
    if (texture) {
      if (scale) texture.userData.scale = scale;
      if (bias) texture.userData.bias = bias;
      if (uvChannel !== 0) texture.channel = uvChannel;
      this.textureCache[cacheKey] = texture;
    }
    return texture;
  }
  _applyTextureTransforms(texture, attrs) {
    if (!attrs) return;
    const scale = attrs["inputs:scale"];
    if (scale && Array.isArray(scale) && scale.length >= 2) {
      texture.repeat.set(scale[0], scale[1]);
    }
    const translation = attrs["inputs:translation"];
    if (translation && Array.isArray(translation) && translation.length >= 2) {
      texture.offset.set(translation[0], translation[1]);
    }
    const rotation = attrs["inputs:rotation"];
    if (typeof rotation === "number") {
      texture.rotation = rotation * Math.PI / 180;
    }
  }
  _loadTexture(filePath, textureAttrs, transformAttrs) {
    let cleanPath = filePath;
    if (cleanPath.startsWith("@")) cleanPath = cleanPath.slice(1);
    if (cleanPath.endsWith("@")) cleanPath = cleanPath.slice(0, -1);
    const resolvedPath = this._resolveFilePath(cleanPath);
    let assetData = this.assets[resolvedPath];
    if (!assetData) {
      assetData = this.assets[cleanPath];
    }
    if (!assetData) {
      const baseName = cleanPath.split("/").pop();
      for (const key in this.assets) {
        if (key.endsWith(baseName) || key.endsWith("/" + baseName)) {
          return this._createTextureFromData(this.assets[key], textureAttrs, transformAttrs);
        }
      }
      if (this.basePath) {
        return this._createTextureFromData(resolvedPath, textureAttrs, transformAttrs);
      }
      if (this.manager) {
        const url = this.manager.resolveURL(baseName);
        if (url !== baseName) {
          return this._createTextureFromData(url, textureAttrs, transformAttrs);
        }
      }
      console.warn("USDLoader: Texture not found:", cleanPath);
      return null;
    }
    return this._createTextureFromData(assetData, textureAttrs, transformAttrs);
  }
  _createTextureFromData(data, textureAttrs, transformAttrs) {
    if (!data) return null;
    const scope = this;
    const texture = new Texture();
    let url;
    if (typeof data === "string") {
      url = data;
    } else if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
      const blob = new Blob([data]);
      url = URL.createObjectURL(blob);
    } else {
      return null;
    }
    const image = new Image();
    this.texturePromises.push(new Promise((resolve) => {
      image.onload = function() {
        texture.image = image;
        if (textureAttrs) {
          texture.wrapS = scope._getWrapMode(textureAttrs["inputs:wrapS"]);
          texture.wrapT = scope._getWrapMode(textureAttrs["inputs:wrapT"]);
        }
        scope._applyTextureTransforms(texture, transformAttrs);
        texture.needsUpdate = true;
        if (typeof data !== "string") {
          URL.revokeObjectURL(url);
        }
        resolve();
      };
      image.onerror = function() {
        console.warn("USDLoader: Failed to load texture:", url);
        if (typeof data !== "string") {
          URL.revokeObjectURL(url);
        }
        resolve();
      };
    }));
    image.src = url;
    return texture;
  }
  _getWrapMode(wrapValue) {
    if (wrapValue === "repeat") return RepeatWrapping;
    if (wrapValue === "mirror") return MirroredRepeatWrapping;
    if (wrapValue === "clamp") return ClampToEdgeWrapping;
    return RepeatWrapping;
  }
  // ========================================================================
  // Skeletal Animation
  // ========================================================================
  _buildSkeleton(path) {
    const attrs = this._getAttributes(path);
    const joints = attrs["joints"];
    if (!joints || joints.length === 0) return null;
    const rawBindTransforms = attrs["bindTransforms"];
    const rawRestTransforms = attrs["restTransforms"];
    const bindTransforms = this._flattenMatrixArray(rawBindTransforms, joints.length);
    const restTransforms = this._flattenMatrixArray(rawRestTransforms, joints.length);
    const bones = [];
    const bonesByPath = {};
    const boneInverses = [];
    for (let i = 0; i < joints.length; i++) {
      const jointPath = joints[i];
      const jointName = jointPath.split("/").pop();
      const bone = new Bone();
      bone.name = jointName;
      bones.push(bone);
      bonesByPath[jointPath] = { bone, index: i };
      if (bindTransforms && bindTransforms.length >= (i + 1) * 16) {
        const bindMatrix = new Matrix4();
        const m = bindTransforms.slice(i * 16, (i + 1) * 16);
        bindMatrix.set(
          m[0],
          m[4],
          m[8],
          m[12],
          m[1],
          m[5],
          m[9],
          m[13],
          m[2],
          m[6],
          m[10],
          m[14],
          m[3],
          m[7],
          m[11],
          m[15]
        );
        const inverseBindMatrix = bindMatrix.clone().invert();
        boneInverses.push(inverseBindMatrix);
      } else {
        boneInverses.push(new Matrix4());
      }
    }
    for (let i = 0; i < joints.length; i++) {
      const jointPath = joints[i];
      const parts = jointPath.split("/");
      if (parts.length > 1) {
        const parentPath = parts.slice(0, -1).join("/");
        const parentData = bonesByPath[parentPath];
        if (parentData) {
          parentData.bone.add(bones[i]);
        }
      }
    }
    if (restTransforms && restTransforms.length >= joints.length * 16) {
      for (let i = 0; i < joints.length; i++) {
        const matrix = new Matrix4();
        const m = restTransforms.slice(i * 16, (i + 1) * 16);
        matrix.set(
          m[0],
          m[4],
          m[8],
          m[12],
          m[1],
          m[5],
          m[9],
          m[13],
          m[2],
          m[6],
          m[10],
          m[14],
          m[3],
          m[7],
          m[11],
          m[15]
        );
        matrix.decompose(bones[i].position, bones[i].quaternion, bones[i].scale);
      }
    }
    const rootBones = bones.filter((bone) => !bone.parent || !bone.parent.isBone);
    const animSourceSpec = this.specsByPath[path + ".skel:animationSource"];
    let animationPath = null;
    if (animSourceSpec && animSourceSpec.fields.targetPaths && animSourceSpec.fields.targetPaths.length > 0) {
      animationPath = animSourceSpec.fields.targetPaths[0];
    }
    return {
      skeleton: new Skeleton(bones, boneInverses),
      joints,
      rootBones,
      animationPath,
      path
    };
  }
  _bindSkeletons() {
    for (const meshData of this.skinnedMeshes) {
      const { mesh, skeletonPath, localJoints, geomBindTransform } = meshData;
      let skeletonData = null;
      if (skeletonPath && this.skeletons[skeletonPath]) {
        skeletonData = this.skeletons[skeletonPath];
      }
      if (!skeletonData) {
        for (const skelPath in this.skeletons) {
          if (skeletonPath && (skeletonPath.includes(skelPath) || skelPath.includes(skeletonPath))) {
            skeletonData = this.skeletons[skelPath];
            break;
          }
        }
      }
      if (!skeletonData) {
        const skeletonPaths = Object.keys(this.skeletons);
        if (skeletonPaths.length > 0) {
          skeletonData = this.skeletons[skeletonPaths[0]];
        }
      }
      if (!skeletonData) {
        console.warn("USDComposer: No skeleton found for skinned mesh", mesh.name);
        continue;
      }
      const { skeleton, rootBones, joints } = skeletonData;
      if (localJoints && localJoints.length > 0) {
        const skinIndex = mesh.geometry.attributes.skinIndex;
        if (skinIndex) {
          const localToGlobal = [];
          for (let i = 0; i < localJoints.length; i++) {
            const jointName = localJoints[i];
            const globalIdx = joints.indexOf(jointName);
            localToGlobal[i] = globalIdx >= 0 ? globalIdx : 0;
          }
          const arr = skinIndex.array;
          for (let i = 0; i < arr.length; i++) {
            const localIdx = arr[i];
            if (localIdx < localToGlobal.length) {
              arr[i] = localToGlobal[localIdx];
            }
          }
        }
      }
      for (const rootBone of rootBones) {
        mesh.add(rootBone);
      }
      const bindMatrix = new Matrix4();
      if (geomBindTransform && geomBindTransform.length === 16) {
        const m = geomBindTransform;
        bindMatrix.set(
          m[0],
          m[4],
          m[8],
          m[12],
          m[1],
          m[5],
          m[9],
          m[13],
          m[2],
          m[6],
          m[10],
          m[14],
          m[3],
          m[7],
          m[11],
          m[15]
        );
      }
      mesh.bind(skeleton, bindMatrix);
    }
  }
  _buildAnimations() {
    const animations = [];
    for (const path in this.specsByPath) {
      const spec = this.specsByPath[path];
      if (spec.specType !== SpecType.Prim) continue;
      if (spec.fields.typeName !== "SkelAnimation") continue;
      const clip = this._buildAnimationClip(path);
      if (clip) {
        animations.push(clip);
      }
    }
    const transformTracks = this._buildTransformAnimations();
    if (transformTracks.length > 0) {
      animations.push(new AnimationClip("TransformAnimation", -1, transformTracks));
    }
    return animations;
  }
  _buildTransformAnimations() {
    var _a, _b, _c, _d, _e, _f, _g;
    const tracks = [];
    for (const path in this.specsByPath) {
      const spec = this.specsByPath[path];
      if (spec.specType !== SpecType.Prim) continue;
      const typeName = (_a = spec.fields) == null ? void 0 : _a.typeName;
      if (typeName !== "Xform" && typeName !== "Scope" && typeName !== "Mesh") continue;
      const objectName = path.split("/").pop();
      const orientPath = path + ".xformOp:orient";
      const orientSpec = this.specsByPath[orientPath];
      if ((_b = orientSpec == null ? void 0 : orientSpec.fields) == null ? void 0 : _b.timeSamples) {
        const { times, values } = orientSpec.fields.timeSamples;
        const keyframeTimes = [];
        const keyframeValues = [];
        for (let i = 0; i < times.length; i++) {
          keyframeTimes.push(times[i] / this.fps);
          const q = values[i];
          keyframeValues.push(q[0], q[1], q[2], q[3]);
        }
        if (keyframeTimes.length > 0) {
          tracks.push(new QuaternionKeyframeTrack(
            objectName + ".quaternion",
            new Float32Array(keyframeTimes),
            new Float32Array(keyframeValues)
          ));
        }
      }
      const rotateXYZPath = path + ".xformOp:rotateXYZ";
      const rotateXYZSpec = this.specsByPath[rotateXYZPath];
      if ((_c = rotateXYZSpec == null ? void 0 : rotateXYZSpec.fields) == null ? void 0 : _c.timeSamples) {
        const { times, values } = rotateXYZSpec.fields.timeSamples;
        const keyframeTimes = [];
        const keyframeValues = [];
        const tempEuler = new Euler();
        const tempQuat = new Quaternion();
        for (let i = 0; i < times.length; i++) {
          keyframeTimes.push(times[i] / this.fps);
          const r = values[i];
          tempEuler.set(
            r[0] * Math.PI / 180,
            r[1] * Math.PI / 180,
            r[2] * Math.PI / 180,
            "ZYX"
          );
          tempQuat.setFromEuler(tempEuler);
          keyframeValues.push(tempQuat.x, tempQuat.y, tempQuat.z, tempQuat.w);
        }
        if (keyframeTimes.length > 0) {
          tracks.push(new QuaternionKeyframeTrack(
            objectName + ".quaternion",
            new Float32Array(keyframeTimes),
            new Float32Array(keyframeValues)
          ));
        }
      }
      const translatePath = path + ".xformOp:translate";
      const translateSpec = this.specsByPath[translatePath];
      if ((_d = translateSpec == null ? void 0 : translateSpec.fields) == null ? void 0 : _d.timeSamples) {
        const { times, values } = translateSpec.fields.timeSamples;
        const keyframeTimes = [];
        const keyframeValues = [];
        for (let i = 0; i < times.length; i++) {
          keyframeTimes.push(times[i] / this.fps);
          const t = values[i];
          keyframeValues.push(t[0], t[1], t[2]);
        }
        if (keyframeTimes.length > 0) {
          tracks.push(new VectorKeyframeTrack(
            objectName + ".position",
            new Float32Array(keyframeTimes),
            new Float32Array(keyframeValues)
          ));
        }
      }
      const scalePath = path + ".xformOp:scale";
      const scaleSpec = this.specsByPath[scalePath];
      if ((_e = scaleSpec == null ? void 0 : scaleSpec.fields) == null ? void 0 : _e.timeSamples) {
        const { times, values } = scaleSpec.fields.timeSamples;
        const keyframeTimes = [];
        const keyframeValues = [];
        for (let i = 0; i < times.length; i++) {
          keyframeTimes.push(times[i] / this.fps);
          const s = values[i];
          keyframeValues.push(s[0], s[1], s[2]);
        }
        if (keyframeTimes.length > 0) {
          tracks.push(new VectorKeyframeTrack(
            objectName + ".scale",
            new Float32Array(keyframeTimes),
            new Float32Array(keyframeValues)
          ));
        }
      }
      const properties = ((_f = spec.fields) == null ? void 0 : _f.properties) || [];
      for (const prop of properties) {
        if (!prop.startsWith("xformOp:transform")) continue;
        const transformPath = path + "." + prop;
        const transformSpec = this.specsByPath[transformPath];
        if (!((_g = transformSpec == null ? void 0 : transformSpec.fields) == null ? void 0 : _g.timeSamples)) continue;
        const { times, values } = transformSpec.fields.timeSamples;
        const positionTimes = [];
        const positionValues = [];
        const quaternionTimes = [];
        const quaternionValues = [];
        const scaleTimes = [];
        const scaleValues = [];
        const matrix = new Matrix4();
        const position = new Vector3();
        const quaternion = new Quaternion();
        const scale = new Vector3();
        for (let i = 0; i < times.length; i++) {
          const m = values[i];
          if (!m || m.length < 16) continue;
          const t = times[i] / this.fps;
          matrix.set(
            m[0],
            m[4],
            m[8],
            m[12],
            m[1],
            m[5],
            m[9],
            m[13],
            m[2],
            m[6],
            m[10],
            m[14],
            m[3],
            m[7],
            m[11],
            m[15]
          );
          matrix.decompose(position, quaternion, scale);
          positionTimes.push(t);
          positionValues.push(position.x, position.y, position.z);
          quaternionTimes.push(t);
          quaternionValues.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
          scaleTimes.push(t);
          scaleValues.push(scale.x, scale.y, scale.z);
        }
        if (positionTimes.length > 0) {
          tracks.push(new VectorKeyframeTrack(
            objectName + ".position",
            new Float32Array(positionTimes),
            new Float32Array(positionValues)
          ));
          tracks.push(new QuaternionKeyframeTrack(
            objectName + ".quaternion",
            new Float32Array(quaternionTimes),
            new Float32Array(quaternionValues)
          ));
          tracks.push(new VectorKeyframeTrack(
            objectName + ".scale",
            new Float32Array(scaleTimes),
            new Float32Array(scaleValues)
          ));
        }
        break;
      }
    }
    return tracks;
  }
  _buildAnimationClip(path) {
    const attrs = this._getAttributes(path);
    const joints = attrs["joints"];
    if (!joints || joints.length === 0) return null;
    const tracks = [];
    const rotationsAttr = this._getTimeSampledAttribute(path, "rotations");
    if (rotationsAttr && rotationsAttr.times && rotationsAttr.values) {
      const { times, values } = rotationsAttr;
      for (let jointIdx = 0; jointIdx < joints.length; jointIdx++) {
        const jointName = joints[jointIdx].split("/").pop();
        const keyframeTimes = [];
        const keyframeValues = [];
        for (let t = 0; t < times.length; t++) {
          const quatData = values[t];
          if (!quatData || quatData.length < (jointIdx + 1) * 4) continue;
          keyframeTimes.push(times[t] / this.fps);
          const x = quatData[jointIdx * 4 + 0];
          const y = quatData[jointIdx * 4 + 1];
          const z = quatData[jointIdx * 4 + 2];
          const w = quatData[jointIdx * 4 + 3];
          keyframeValues.push(x, y, z, w);
        }
        if (keyframeTimes.length > 0) {
          tracks.push(new QuaternionKeyframeTrack(
            jointName + ".quaternion",
            new Float32Array(keyframeTimes),
            new Float32Array(keyframeValues)
          ));
        }
      }
    }
    const translationsAttr = this._getTimeSampledAttribute(path, "translations");
    if (translationsAttr && translationsAttr.times && translationsAttr.values) {
      const { times, values } = translationsAttr;
      for (let jointIdx = 0; jointIdx < joints.length; jointIdx++) {
        const jointName = joints[jointIdx].split("/").pop();
        const keyframeTimes = [];
        const keyframeValues = [];
        for (let t = 0; t < times.length; t++) {
          const transData = values[t];
          if (!transData || transData.length < (jointIdx + 1) * 3) continue;
          keyframeTimes.push(times[t] / this.fps);
          keyframeValues.push(
            transData[jointIdx * 3 + 0],
            transData[jointIdx * 3 + 1],
            transData[jointIdx * 3 + 2]
          );
        }
        if (keyframeTimes.length > 0) {
          tracks.push(new VectorKeyframeTrack(
            jointName + ".position",
            new Float32Array(keyframeTimes),
            new Float32Array(keyframeValues)
          ));
        }
      }
    }
    const scalesAttr = this._getTimeSampledAttribute(path, "scales");
    if (scalesAttr && scalesAttr.times && scalesAttr.values) {
      const { times, values } = scalesAttr;
      for (let jointIdx = 0; jointIdx < joints.length; jointIdx++) {
        const jointName = joints[jointIdx].split("/").pop();
        const keyframeTimes = [];
        const keyframeValues = [];
        for (let t = 0; t < times.length; t++) {
          const scaleData = values[t];
          if (!scaleData || scaleData.length < (jointIdx + 1) * 3) continue;
          keyframeTimes.push(times[t] / this.fps);
          keyframeValues.push(
            scaleData[jointIdx * 3 + 0],
            scaleData[jointIdx * 3 + 1],
            scaleData[jointIdx * 3 + 2]
          );
        }
        if (keyframeTimes.length > 0) {
          tracks.push(new VectorKeyframeTrack(
            jointName + ".scale",
            new Float32Array(keyframeTimes),
            new Float32Array(keyframeValues)
          ));
        }
      }
    }
    if (tracks.length === 0) return null;
    const clipName = path.split("/").pop();
    return new AnimationClip(clipName, -1, tracks);
  }
  _getTimeSampledAttribute(primPath, attrName) {
    const attrPath = primPath + "." + attrName;
    const attrSpec = this.specsByPath[attrPath];
    if (attrSpec && attrSpec.fields.timeSamples) {
      const timeSamples = attrSpec.fields.timeSamples;
      if (timeSamples.times && timeSamples.values) {
        return timeSamples;
      }
    }
    return null;
  }
  _flattenMatrixArray(matrices, numMatrices) {
    if (!matrices || matrices.length === 0) return null;
    if (typeof matrices[0] === "number") return matrices;
    const flatArray = [];
    for (let m = 0; m < numMatrices; m++) {
      for (let row = 0; row < 4; row++) {
        const rowData = matrices[m * 4 + row];
        if (rowData && rowData.length === 4) {
          flatArray.push(rowData[0], rowData[1], rowData[2], rowData[3]);
        } else {
          flatArray.push(row === 0 ? 1 : 0, row === 1 ? 1 : 0, row === 2 ? 1 : 0, row === 3 ? 1 : 0);
        }
      }
    }
    return flatArray;
  }
}
export { USDComposer, SpecType };
