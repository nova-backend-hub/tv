import { Fn, uvec2, If, instancedArray, instanceIndex, invocationLocalIndex, Loop, workgroupArray, workgroupBarrier, workgroupId, uint, select, min, max } from "three/tsl";
const StepType = {
  NONE: 0,
  // Swap all values within the local range of workgroupSize * 2
  SWAP_LOCAL: 1,
  DISPERSE_LOCAL: 2,
  // Swap values within global data buffer.
  FLIP_GLOBAL: 3,
  DISPERSE_GLOBAL: 4
};
export const getBitonicFlipIndices = /* @__PURE__ */ Fn(([index, blockHeight]) => {
  const blockOffset = index.mul(2).div(blockHeight).mul(blockHeight);
  const halfHeight = blockHeight.div(2);
  const idx = uvec2(
    index.mod(halfHeight),
    blockHeight.sub(index.mod(halfHeight)).sub(1)
  );
  idx.x.addAssign(blockOffset);
  idx.y.addAssign(blockOffset);
  return idx;
}).setLayout({
  name: "getBitonicFlipIndices",
  type: "uvec2",
  inputs: [
    { name: "index", type: "uint" },
    { name: "blockHeight", type: "uint" }
  ]
});
export const getBitonicDisperseIndices = /* @__PURE__ */ Fn(([index, swapSpan]) => {
  const blockOffset = index.mul(2).div(swapSpan).mul(swapSpan);
  const halfHeight = swapSpan.div(2);
  const idx = uvec2(
    index.mod(halfHeight),
    index.mod(halfHeight).add(halfHeight)
  );
  idx.x.addAssign(blockOffset);
  idx.y.addAssign(blockOffset);
  return idx;
}).setLayout({
  name: "getBitonicDisperseIndices",
  type: "uvec2",
  inputs: [
    { name: "index", type: "uint" },
    { name: "blockHeight", type: "uint" }
  ]
});
export class BitonicSort {
  /**
   * Constructs a new light probe helper.
   *
   * @param {Renderer} renderer - The current scene's renderer.
   * @param {StorageBufferNode} dataBuffer - The data buffer to sort.
   * @param {Object} [options={}] - Options that modify the bitonic sort.
   */
  constructor(renderer, dataBuffer, options = {}) {
    this.renderer = renderer;
    this.dataBuffer = dataBuffer;
    this.count = dataBuffer.value.count;
    this.dispatchSize = this.count / 2;
    this.workgroupSize = options.workgroupSize ? Math.min(this.dispatchSize, options.workgroupSize) : Math.min(this.dispatchSize, 64);
    this.localStorage = workgroupArray(dataBuffer.nodeType, this.workgroupSize * 2);
    this._tempArray = new Uint32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      this._tempArray[i] = 0;
    }
    this.tempBuffer = instancedArray(this.count, dataBuffer.nodeType).setName("TempStorage");
    this.infoStorage = instancedArray(new Uint32Array([1, 2, 2]), "uint").setName("BitonicSortInfo");
    this.swapOpCount = this._getSwapOpCount();
    this.stepCount = this._getStepCount();
    this.readBufferName = "Data";
    this.flipGlobalNodes = {
      "Data": this._getFlipGlobal(this.dataBuffer, this.tempBuffer),
      "Temp": this._getFlipGlobal(this.tempBuffer, this.dataBuffer)
    };
    this.disperseGlobalNodes = {
      "Data": this._getDisperseGlobal(this.dataBuffer, this.tempBuffer),
      "Temp": this._getDisperseGlobal(this.tempBuffer, this.dataBuffer)
    };
    this.swapLocalFn = this._getSwapLocal();
    this.disperseLocalNodes = {
      "Data": this._getDisperseLocal(this.dataBuffer),
      "Temp": this._getDisperseLocal(this.tempBuffer)
    };
    this.setAlgoFn = this._getSetAlgoFn();
    this.alignFn = this._getAlignFn();
    this.resetFn = this._getResetFn();
    this.currentDispatch = 0;
    this.globalOpsRemaining = 0;
    this.globalOpsInSpan = 0;
  }
  /**
   * Get total number of distinct swaps that occur in a bitonic sort.
   *
   * @private
   * @returns {number} - The total number of distinct swaps in a bitonic sort
   */
  _getSwapOpCount() {
    const n = Math.log2(this.count);
    return n * (n + 1) / 2;
  }
  /**
   * Get the number of steps it takes to execute a complete bitonic sort.
   *
   * @private
   * @returns {number} The number of steps it takes to execute a complete bitonic sort.
   */
  _getStepCount() {
    const logElements = Math.log2(this.count);
    const logSwapSpan = Math.log2(this.workgroupSize * 2);
    const numGlobalFlips = logElements - logSwapSpan;
    let numSteps = 1;
    let numGlobalDisperses = 0;
    for (let i = 1; i <= numGlobalFlips; i++) {
      numSteps += 1;
      numSteps += numGlobalDisperses;
      numSteps += 1;
      numGlobalDisperses += 1;
    }
    return numSteps;
  }
  /**
   * Compares and swaps two data points in the data buffer within the global address space.
   * @param {Node<uint>} idxBefore - The index of the first data element in the data buffer.
   * @param {Node<uint>} idxAfter - The index of the second data element in the data buffer.
   * @param {StorageBufferNode} dataBuffer - The buffer of data to read from.
   * @param {StorageBufferNode} tempBuffer - The buffer of data to write to.
   * @private
   *
   */
  _globalCompareAndSwapTSL(idxBefore, idxAfter, dataBuffer, tempBuffer) {
    const data1 = dataBuffer.element(idxBefore);
    const data2 = dataBuffer.element(idxAfter);
    tempBuffer.element(idxBefore).assign(min(data1, data2));
    tempBuffer.element(idxAfter).assign(max(data1, data2));
  }
  /**
   * Compares and swaps two data points in the data buffer within the local address space.
   *
   * @private
   * @param {Node<uint>} idxBefore - The index of the first data element in the data buffer.
   * @param {Node<uint>} idxAfter - The index of the second data element in the data buffer
   */
  _localCompareAndSwapTSL(idxBefore, idxAfter) {
    const { localStorage } = this;
    const data1 = localStorage.element(idxBefore).toVar();
    const data2 = localStorage.element(idxAfter).toVar();
    localStorage.element(idxBefore).assign(min(data1, data2));
    localStorage.element(idxAfter).assign(max(data1, data2));
  }
  /**
   * Create the compute shader that performs a global disperse swap on the data buffer.
   *
   * @private
   * @param {StorageBufferNode} readBuffer - The data buffer to read from.
   * @param {StorageBufferNode} writeBuffer - The data buffer to read from.
   * @returns {ComputeNode} - A compute shader that performs a global disperse swap on the data buffer.
   */
  _getDisperseGlobal(readBuffer, writeBuffer) {
    const { infoStorage } = this;
    const currentSwapSpan = infoStorage.element(1);
    const fnDef = Fn(() => {
      const idx = getBitonicDisperseIndices(instanceIndex, currentSwapSpan);
      this._globalCompareAndSwapTSL(idx.x, idx.y, readBuffer, writeBuffer);
    })().compute(this.dispatchSize, [this.workgroupSize]);
    return fnDef;
  }
  /**
   * Create the compute shader that performs a global flip swap on the data buffer.
   *
   * @private
   * @param {StorageBufferNode} readBuffer - The data buffer to read from.
   * @param {StorageBufferNode} writeBuffer - The data buffer to read from.
   * @returns {ComputeNode} - A compute shader that executes a global flip swap.
   */
  _getFlipGlobal(readBuffer, writeBuffer) {
    const { infoStorage } = this;
    const currentSwapSpan = infoStorage.element(1);
    const fnDef = Fn(() => {
      const idx = getBitonicFlipIndices(instanceIndex, currentSwapSpan);
      this._globalCompareAndSwapTSL(idx.x, idx.y, readBuffer, writeBuffer);
    })().compute(this.dispatchSize, [this.workgroupSize]);
    return fnDef;
  }
  /**
   * Create the compute shader that performs a complete local swap on the data buffer.
   *
   * @private
   * @returns {ComputeNode} - A compute shader that executes a full local swap.
   */
  _getSwapLocal() {
    const { localStorage, dataBuffer, workgroupSize } = this;
    const fnDef = Fn(() => {
      const localOffset = uint(workgroupSize).mul(2).mul(workgroupId.x).toVar();
      const localID1 = invocationLocalIndex.mul(2);
      const localID2 = invocationLocalIndex.mul(2).add(1);
      localStorage.element(localID1).assign(dataBuffer.element(localOffset.add(localID1)));
      localStorage.element(localID2).assign(dataBuffer.element(localOffset.add(localID2)));
      workgroupBarrier();
      const flipBlockHeight = uint(2);
      Loop({ start: uint(2), end: uint(workgroupSize * 2), type: "uint", condition: "<=", update: "<<= 1" }, () => {
        workgroupBarrier();
        const flipIdx = getBitonicFlipIndices(invocationLocalIndex, flipBlockHeight);
        this._localCompareAndSwapTSL(flipIdx.x, flipIdx.y);
        const localBlockHeight = flipBlockHeight.div(2);
        Loop({ start: localBlockHeight, end: uint(1), type: "uint", condition: ">", update: ">>= 1" }, () => {
          workgroupBarrier();
          const disperseIdx = getBitonicDisperseIndices(invocationLocalIndex, localBlockHeight);
          this._localCompareAndSwapTSL(disperseIdx.x, disperseIdx.y);
          localBlockHeight.divAssign(2);
        });
        flipBlockHeight.shiftLeftAssign(1);
      });
      workgroupBarrier();
      dataBuffer.element(localOffset.add(localID1)).assign(localStorage.element(localID1));
      dataBuffer.element(localOffset.add(localID2)).assign(localStorage.element(localID2));
    })().compute(this.dispatchSize, [this.workgroupSize]);
    return fnDef;
  }
  /**
   * Create the compute shader that performs a local disperse swap on the data buffer.
   *
   * @private
   * @param {StorageBufferNode} readWriteBuffer - The data buffer to read from and write to.
   * @returns {ComputeNode} - A compute shader that executes a local disperse swap.
   */
  _getDisperseLocal(readWriteBuffer) {
    const { localStorage, workgroupSize } = this;
    const fnDef = Fn(() => {
      const localOffset = uint(workgroupSize).mul(2).mul(workgroupId.x).toVar();
      const localID1 = invocationLocalIndex.mul(2);
      const localID2 = invocationLocalIndex.mul(2).add(1);
      localStorage.element(localID1).assign(readWriteBuffer.element(localOffset.add(localID1)));
      localStorage.element(localID2).assign(readWriteBuffer.element(localOffset.add(localID2)));
      workgroupBarrier();
      const localBlockHeight = uint(workgroupSize * 2);
      Loop({ start: localBlockHeight, end: uint(1), type: "uint", condition: ">", update: ">>= 1" }, () => {
        workgroupBarrier();
        const disperseIdx = getBitonicDisperseIndices(invocationLocalIndex, localBlockHeight);
        this._localCompareAndSwapTSL(disperseIdx.x, disperseIdx.y);
        localBlockHeight.divAssign(2);
      });
      workgroupBarrier();
      readWriteBuffer.element(localOffset.add(localID1)).assign(localStorage.element(localID1));
      readWriteBuffer.element(localOffset.add(localID2)).assign(localStorage.element(localID2));
    })().compute(this.dispatchSize, [this.workgroupSize]);
    return fnDef;
  }
  /**
   * Create the compute shader that resets the sort's algorithm information.
   *
   * @private
   * @returns {ComputeNode} - A compute shader that resets the bitonic sort's algorithm information.
   */
  _getResetFn() {
    const fnDef = Fn(() => {
      const { infoStorage } = this;
      const currentAlgo = infoStorage.element(0);
      const currentSwapSpan = infoStorage.element(1);
      const maxSwapSpan = infoStorage.element(2);
      currentAlgo.assign(StepType.SWAP_LOCAL);
      currentSwapSpan.assign(2);
      maxSwapSpan.assign(2);
    })().compute(1);
    return fnDef;
  }
  /**
   * Create the compute shader that copies the state of the last global swap to the data buffer.
   *
   * @private
   * @returns {ComputeNode} - A compute shader that copies the state of the last global swap to the data buffer.
   */
  _getAlignFn() {
    const { dataBuffer, tempBuffer } = this;
    const fnDef = Fn(() => {
      dataBuffer.element(instanceIndex).assign(tempBuffer.element(instanceIndex));
    })().compute(this.count, [this.workgroupSize]);
    return fnDef;
  }
  /**
   * Create the compute shader that sets the bitonic sort algorithm's information.
   *
   * @private
   * @returns {ComputeNode} - A compute shader that sets the bitonic sort algorithm's information.
   */
  _getSetAlgoFn() {
    const fnDef = Fn(() => {
      const { infoStorage, workgroupSize } = this;
      const currentAlgo = infoStorage.element(0);
      const currentSwapSpan = infoStorage.element(1);
      const maxSwapSpan = infoStorage.element(2);
      If(currentAlgo.equal(StepType.SWAP_LOCAL), () => {
        const nextHighestSwapSpan = uint(workgroupSize * 4);
        currentAlgo.assign(StepType.FLIP_GLOBAL);
        currentSwapSpan.assign(nextHighestSwapSpan);
        maxSwapSpan.assign(nextHighestSwapSpan);
      }).ElseIf(currentAlgo.equal(StepType.DISPERSE_LOCAL), () => {
        currentAlgo.assign(StepType.FLIP_GLOBAL);
        const nextHighestSwapSpan = maxSwapSpan.mul(2);
        currentSwapSpan.assign(nextHighestSwapSpan);
        maxSwapSpan.assign(nextHighestSwapSpan);
      }).Else(() => {
        const nextSwapSpan = currentSwapSpan.div(2);
        currentAlgo.assign(
          select(
            nextSwapSpan.lessThanEqual(uint(workgroupSize * 2)),
            StepType.DISPERSE_LOCAL,
            StepType.DISPERSE_GLOBAL
          ).uniformFlow()
        );
        currentSwapSpan.assign(nextSwapSpan);
      });
    })().compute(1);
    return fnDef;
  }
  /**
   * Executes a step of the bitonic sort operation.
   *
   * @param {Renderer} renderer - The current scene's renderer.
   */
  computeStep(renderer) {
    if (this.currentDispatch === 0) {
      renderer.compute(this.swapLocalFn);
      this.globalOpsRemaining = 1;
      this.globalOpsInSpan = 1;
    } else if (this.globalOpsRemaining > 0) {
      const swapType = this.globalOpsRemaining === this.globalOpsInSpan ? "Flip" : "Disperse";
      renderer.compute(swapType === "Flip" ? this.flipGlobalNodes[this.readBufferName] : this.disperseGlobalNodes[this.readBufferName]);
      if (this.readBufferName === "Data") {
        this.readBufferName = "Temp";
      } else {
        this.readBufferName = "Data";
      }
      this.globalOpsRemaining -= 1;
    } else {
      renderer.compute(this.disperseLocalNodes[this.readBufferName]);
      const nextSpanGlobalOps = this.globalOpsInSpan + 1;
      this.globalOpsInSpan = nextSpanGlobalOps;
      this.globalOpsRemaining = nextSpanGlobalOps;
    }
    this.currentDispatch += 1;
    if (this.currentDispatch === this.stepCount) {
      if (this.readBufferName === "Temp") {
        renderer.compute(this.alignFn);
        this.readBufferName = "Data";
      }
      renderer.compute(this.resetFn);
      this.currentDispatch = 0;
      this.globalOpsRemaining = 0;
      this.globalOpsInSpan = 0;
    } else {
      renderer.compute(this.setAlgoFn);
    }
  }
  /**
   * Executes a complete bitonic sort on the data buffer.
   *
   * @param {Renderer} renderer - The current scene's renderer.
   */
  compute(renderer) {
    this.globalOpsRemaining = 0;
    this.globalOpsInSpan = 0;
    this.currentDispatch = 0;
    for (let i = 0; i < this.stepCount; i++) {
      this.computeStep(renderer);
    }
  }
}
