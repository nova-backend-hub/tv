import { DataTexture, FloatType, RGBAFormat, Vector2, Vector3, LightsNode, NodeUpdateType } from "three/webgpu";
import {
  attributeArray,
  nodeProxy,
  int,
  float,
  vec3,
  vec4,
  ivec2,
  ivec4,
  uniform,
  Break,
  Loop,
  positionView,
  Fn,
  If,
  Return,
  textureLoad,
  instanceIndex,
  screenCoordinate,
  directPointLight,
  renderGroup,
  min,
  max,
  pow,
  log,
  clamp,
  dot
} from "three/tsl";
const _vector3 = /* @__PURE__ */ new Vector3();
const _size = /* @__PURE__ */ new Vector2();
class ClusteredLightsNode extends LightsNode {
  static get type() {
    return "ClusteredLightsNode";
  }
  /**
   * Constructs a new clustered lights node.
   *
   * @param {number} [maxLights=1024] - Maximum number of point lights.
   * @param {number} [tileSize=32] - Screen tile size in pixels (cluster XY size).
   * @param {number} [zSlices=24] - Number of exponential depth slices.
   * @param {number} [maxLightsPerCluster=64] - Per-cluster light-list capacity.
   */
  constructor(maxLights = 1024, tileSize = 32, zSlices = 24, maxLightsPerCluster = 64) {
    super();
    this.materialLights = [];
    this.clusteredLights = [];
    this._allLights = [];
    this.maxLights = maxLights;
    this.tileSize = tileSize;
    this.zSlices = zSlices;
    this.maxLightsPerCluster = maxLightsPerCluster;
    this._chunksPerCluster = Math.ceil(maxLightsPerCluster / 4);
    this._bufferSize = null;
    this._lightIndexes = null;
    this._screenClusterIndex = null;
    this._compute = null;
    this._lightsTexture = null;
    this._zSliceRangesTexture = null;
    this._zSliceRangesData = null;
    this._lightViewZ = new Float32Array(maxLights);
    this._lightSortOrder = [];
    this._lightsCount = uniform(0, "int");
    this._cameraNear = uniform(0).setName("clusteredCameraNear").setGroup(renderGroup);
    this._cameraFar = uniform(0).setName("clusteredCameraFar").setGroup(renderGroup);
    this._cameraViewMatrix = uniform("mat4").setName("clusteredCameraViewMatrix").setGroup(renderGroup);
    this._cameraProjectionMatrix = uniform("mat4").setName("clusteredCameraProjectionMatrix").setGroup(renderGroup);
    this._gridDimensions = uniform(new Vector2());
    this.updateBeforeType = NodeUpdateType.RENDER;
  }
  customCacheKey() {
    return (this._compute ? this._compute.getCacheKey() : 0) + super.customCacheKey();
  }
  updateLightsTexture(camera) {
    const { _lightsTexture: lightsTexture, clusteredLights: clusteredLights2 } = this;
    const data = lightsTexture.image.data;
    const lineSize = lightsTexture.image.width * 4;
    const count = clusteredLights2.length;
    this._lightsCount.value = count;
    const viewZ = this._lightViewZ;
    const order = this._lightSortOrder;
    for (let i = 0; i < count; i++) {
      _vector3.setFromMatrixPosition(clusteredLights2[i].matrixWorld);
      _vector3.applyMatrix4(camera.matrixWorldInverse);
      viewZ[i] = _vector3.z;
      order[i] = i;
    }
    order.length = count;
    order.sort((a, b) => viewZ[a] - viewZ[b]);
    for (let i = 0; i < count; i++) {
      const light = clusteredLights2[order[i]];
      _vector3.setFromMatrixPosition(light.matrixWorld);
      const offset = i * 4;
      data[offset + 0] = _vector3.x;
      data[offset + 1] = _vector3.y;
      data[offset + 2] = _vector3.z;
      data[offset + 3] = light.distance;
      data[lineSize + offset + 0] = light.color.r * light.intensity;
      data[lineSize + offset + 1] = light.color.g * light.intensity;
      data[lineSize + offset + 2] = light.color.b * light.intensity;
      data[lineSize + offset + 3] = light.decay;
    }
    lightsTexture.needsUpdate = true;
    const zRanges = this._zSliceRangesData;
    if (zRanges === null) return;
    const near = camera.near;
    const far = camera.far;
    const NZ = this.zSlices;
    for (let z = 0; z < NZ; z++) {
      const sliceNear = -(near * Math.pow(far / near, z / NZ));
      const sliceFar = -(near * Math.pow(far / near, (z + 1) / NZ));
      let rangeStart = count;
      let rangeEnd = 0;
      for (let i = 0; i < count; i++) {
        const vz = viewZ[order[i]];
        const r = clusteredLights2[order[i]].distance;
        const radius = r > 0 ? r : far;
        if (vz + radius >= sliceFar && vz - radius <= sliceNear) {
          if (i < rangeStart) rangeStart = i;
          if (i + 1 > rangeEnd) rangeEnd = i + 1;
        }
      }
      if (rangeStart >= count) {
        rangeStart = 0;
        rangeEnd = 0;
      }
      zRanges[z * 4] = rangeStart;
      zRanges[z * 4 + 1] = rangeEnd;
    }
    this._zSliceRangesTexture.needsUpdate = true;
  }
  updateBefore(frame) {
    const { renderer, camera } = frame;
    this.updateProgram(renderer);
    this.updateLightsTexture(camera);
    this._cameraNear.value = camera.near;
    this._cameraFar.value = camera.far;
    this._cameraViewMatrix.value = camera.matrixWorldInverse;
    this._cameraProjectionMatrix.value = camera.projectionMatrix;
    renderer.compute(this._compute);
  }
  setLights(lights) {
    this._allLights = lights;
    const { clusteredLights: clusteredLights2, materialLights } = this;
    let materialIndex = 0;
    let clusteredIndex = 0;
    for (const light of lights) {
      if (light.isPointLight === true && light.castShadow !== true) {
        clusteredLights2[clusteredIndex++] = light;
      } else {
        materialLights[materialIndex++] = light;
      }
    }
    materialLights.length = materialIndex;
    clusteredLights2.length = clusteredIndex;
    return super.setLights(materialLights);
  }
  getLights() {
    return this._allLights;
  }
  getBlock() {
    return this._lightIndexes.element(this._screenClusterIndex.mul(int(this._chunksPerCluster)));
  }
  getTile(element) {
    element = int(element);
    const stride = int(4);
    const chunkOffset = element.div(stride);
    const idx = this._screenClusterIndex.mul(int(this._chunksPerCluster)).add(chunkOffset);
    return this._lightIndexes.element(idx).element(element.mod(stride));
  }
  getClusterLightCount(zSliceNode) {
    const getCount = Fn(([zSliceNode2]) => {
      const count = int(0).toVar();
      const debugClusterIndex = this._screenClusterIndex.toVar();
      If(zSliceNode2.greaterThanEqual(int(0)), () => {
        const tileSize = int(this.tileSize);
        const screenTile = screenCoordinate.div(tileSize).floor();
        const NX = int(this._gridDimensions.x);
        const NY = int(this._gridDimensions.y);
        debugClusterIndex.assign(
          int(screenTile.x).add(int(screenTile.y).mul(NX)).add(zSliceNode2.mul(NX.mul(NY)))
        );
      });
      Loop(this.maxLightsPerCluster, ({ i }) => {
        const element = int(i);
        const stride = int(4);
        const chunkOffset = element.div(stride);
        const idx = debugClusterIndex.mul(int(this._chunksPerCluster)).add(chunkOffset);
        const lightIndex = this._lightIndexes.element(idx).element(element.mod(stride));
        If(lightIndex.equal(int(0)), () => {
          Break();
        });
        count.addAssign(int(1));
      });
      return count;
    });
    return getCount(zSliceNode);
  }
  getLightData(index) {
    index = int(index);
    const dataA = textureLoad(this._lightsTexture, ivec2(index, 0));
    const dataB = textureLoad(this._lightsTexture, ivec2(index, 1));
    const position = dataA.xyz;
    const viewPosition = this._cameraViewMatrix.mul(vec4(position, 1)).xyz;
    const distance = dataA.w;
    const color = dataB.rgb;
    const decay = dataB.w;
    return {
      position,
      viewPosition,
      distance,
      color,
      decay
    };
  }
  setupLights(builder, lightNodes) {
    this.updateProgram(builder.renderer);
    const lightingModel = builder.context.reflectedLight;
    lightingModel.directDiffuse.toStack();
    lightingModel.directSpecular.toStack();
    super.setupLights(builder, lightNodes);
    Fn(() => {
      Loop(this.maxLightsPerCluster, ({ i }) => {
        const lightIndex = this.getTile(i);
        If(lightIndex.equal(int(0)), () => {
          Break();
        });
        const { color, decay, viewPosition, distance } = this.getLightData(lightIndex.sub(1));
        const lightVector = viewPosition.sub(positionView);
        If(distance.equal(0).or(dot(lightVector, lightVector).lessThanEqual(distance.mul(distance))), () => {
          builder.lightsNode.setupDirectLight(builder, this, directPointLight({
            color,
            lightVector,
            cutoffDistance: distance,
            decayExponent: decay
          }));
        });
      });
    }, "void")();
  }
  getBufferFitSize(value) {
    const multiple = this.tileSize;
    return Math.ceil(value / multiple) * multiple;
  }
  setSize(width, height) {
    width = this.getBufferFitSize(width);
    height = this.getBufferFitSize(height);
    if (!this._bufferSize || this._bufferSize.width !== width || this._bufferSize.height !== height) {
      this.create(width, height);
    }
    return this;
  }
  updateProgram(renderer) {
    renderer.getDrawingBufferSize(_size);
    const width = this.getBufferFitSize(_size.width);
    const height = this.getBufferFitSize(_size.height);
    if (this._bufferSize === null) {
      this.create(width, height);
    } else if (this._bufferSize.width !== width || this._bufferSize.height !== height) {
      this.create(width, height);
    }
  }
  create(width, height) {
    const { tileSize, maxLights, zSlices, maxLightsPerCluster, _chunksPerCluster: chunksPerCluster } = this;
    const bufferSize = new Vector2(width, height);
    const NX = Math.floor(bufferSize.width / tileSize);
    const NY = Math.floor(bufferSize.height / tileSize);
    const NZ = zSlices;
    const clusterCount = NX * NY * NZ;
    this._gridDimensions.value.set(NX, NY);
    const lightsData = new Float32Array(maxLights * 4 * 2);
    const lightsTexture = new DataTexture(lightsData, lightsData.length / 8, 2, RGBAFormat, FloatType);
    const zSliceRangesData = new Float32Array(NZ * 4);
    const zSliceRangesTexture = new DataTexture(zSliceRangesData, NZ, 1, RGBAFormat, FloatType);
    const lightIndexesArray = new Int32Array(clusterCount * chunksPerCluster * 4);
    const lightIndexes = attributeArray(lightIndexesArray, "ivec4").setName("lightIndexes");
    const getClusterChunk = (chunkIdx) => {
      const idx = instanceIndex.mul(int(chunksPerCluster)).add(int(chunkIdx));
      return lightIndexes.element(idx);
    };
    const getClusterSlot = (slotIdx) => {
      slotIdx = int(slotIdx);
      const stride = int(4);
      const chunkOffset = slotIdx.div(stride);
      const idx = instanceIndex.mul(int(chunksPerCluster)).add(chunkOffset);
      return lightIndexes.element(idx).element(slotIdx.mod(stride));
    };
    const compute = Fn(() => {
      const invFocalX = float(1).div(this._cameraProjectionMatrix.element(0).element(0));
      const invFocalY = float(1).div(this._cameraProjectionMatrix.element(1).element(1));
      const cx = instanceIndex.mod(NX);
      const cy = instanceIndex.div(NX).mod(NY);
      const cz = instanceIndex.div(NX * NY);
      const ndcXmin = float(cx).mul(2 / NX).sub(1);
      const ndcXmax = float(cx.add(int(1))).mul(2 / NX).sub(1);
      const ndcYmax = float(1).sub(float(cy).mul(2 / NY));
      const ndcYmin = float(1).sub(float(cy.add(int(1))).mul(2 / NY));
      const farOverNear = this._cameraFar.div(this._cameraNear);
      const zNearCluster = this._cameraNear.mul(pow(farOverNear, float(cz).mul(1 / NZ))).negate();
      const zFarCluster = this._cameraNear.mul(pow(farOverNear, float(cz.add(int(1))).mul(1 / NZ))).negate();
      const scaleNearX = zNearCluster.negate().mul(invFocalX);
      const scaleFarX = zFarCluster.negate().mul(invFocalX);
      const scaleNearY = zNearCluster.negate().mul(invFocalY);
      const scaleFarY = zFarCluster.negate().mul(invFocalY);
      const xMinNear = ndcXmin.mul(scaleNearX);
      const xMaxNear = ndcXmax.mul(scaleNearX);
      const xMinFar = ndcXmin.mul(scaleFarX);
      const xMaxFar = ndcXmax.mul(scaleFarX);
      const yMinNear = ndcYmin.mul(scaleNearY);
      const yMaxNear = ndcYmax.mul(scaleNearY);
      const yMinFar = ndcYmin.mul(scaleFarY);
      const yMaxFar = ndcYmax.mul(scaleFarY);
      const aabbMinX = min(xMinNear, xMinFar);
      const aabbMaxX = max(xMaxNear, xMaxFar);
      const aabbMinY = min(yMinNear, yMinFar);
      const aabbMaxY = max(yMaxNear, yMaxFar);
      const aabbMin = vec3(aabbMinX, aabbMinY, zFarCluster);
      const aabbMax = vec3(aabbMaxX, aabbMaxY, zNearCluster);
      Loop(chunksPerCluster, ({ i }) => {
        getClusterChunk(i).assign(ivec4(0));
      });
      const index = int(0).toVar();
      const zRange = textureLoad(zSliceRangesTexture, ivec2(cz, 0));
      const rangeStart = int(zRange.x);
      const rangeEnd = int(zRange.y);
      Loop(this.maxLights, ({ i }) => {
        const lightIdx = rangeStart.add(i);
        If(index.greaterThanEqual(int(maxLightsPerCluster)).or(lightIdx.greaterThanEqual(rangeEnd)), () => {
          Return();
        });
        const { viewPosition, distance } = this.getLightData(lightIdx);
        const pos = viewPosition.xyz;
        const closest = max(aabbMin, min(pos, aabbMax));
        const diff = pos.sub(closest);
        const distSq = dot(diff, diff);
        If(distSq.lessThanEqual(distance.mul(distance)), () => {
          getClusterSlot(index).assign(lightIdx.add(int(1)));
          index.addAssign(int(1));
        });
      });
    })().compute(clusterCount).setName("Update Clustered Lights");
    const getScreenClusterIndex = Fn(() => {
      const screenTile = screenCoordinate.div(tileSize).floor();
      const viewDepth = positionView.z.negate();
      const invLogFarOverNear = float(1).div(log(this._cameraFar.div(this._cameraNear)));
      const sliceFloat = log(viewDepth.div(this._cameraNear)).mul(invLogFarOverNear).mul(float(NZ));
      const zSlice = clamp(sliceFloat.floor(), float(0), float(NZ - 1));
      return int(screenTile.x).add(int(screenTile.y).mul(int(NX))).add(int(zSlice).mul(int(NX * NY)));
    });
    const screenClusterIndex = getScreenClusterIndex().toVar();
    this._bufferSize = bufferSize;
    this._lightIndexes = lightIndexes;
    this._screenClusterIndex = screenClusterIndex;
    this._compute = compute;
    this._lightsTexture = lightsTexture;
    this._zSliceRangesTexture = zSliceRangesTexture;
    this._zSliceRangesData = zSliceRangesData;
  }
  get hasLights() {
    return super.hasLights || this.clusteredLights.length > 0;
  }
}
export default ClusteredLightsNode;
export const clusteredLights = /* @__PURE__ */ nodeProxy(ClusteredLightsNode);
