import {
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Line2NodeMaterial,
  Mesh,
  Vector3
} from "three/webgpu";
import { LineSegmentsGeometry } from "../LineSegmentsGeometry.js";
const _start = new Vector3();
const _end = new Vector3();
class Wireframe extends Mesh {
  /**
   * Constructs a new wireframe.
   *
   * @param {LineSegmentsGeometry} [geometry] - The line geometry.
   * @param {Line2NodeMaterial} [material] - The line material.
   */
  constructor(geometry = new LineSegmentsGeometry(), material = new Line2NodeMaterial({ color: Math.random() * 16777215 })) {
    super(geometry, material);
    this.isWireframe = true;
    this.type = "Wireframe";
  }
  /**
   * Computes an array of distance values which are necessary for rendering dashed lines.
   * For each vertex in the geometry, the method calculates the cumulative length from the
   * current point to the very beginning of the line.
   *
   * @return {Wireframe} A reference to this instance.
   */
  computeLineDistances() {
    const geometry = this.geometry;
    const instanceStart = geometry.attributes.instanceStart;
    const instanceEnd = geometry.attributes.instanceEnd;
    const lineDistances = new Float32Array(2 * instanceStart.count);
    for (let i = 0, j = 0, l = instanceStart.count; i < l; i++, j += 2) {
      _start.fromBufferAttribute(instanceStart, i);
      _end.fromBufferAttribute(instanceEnd, i);
      lineDistances[j] = j === 0 ? 0 : lineDistances[j - 1];
      lineDistances[j + 1] = lineDistances[j] + _start.distanceTo(_end);
    }
    const instanceDistanceBuffer = new InstancedInterleavedBuffer(lineDistances, 2, 1);
    geometry.setAttribute("instanceDistanceStart", new InterleavedBufferAttribute(instanceDistanceBuffer, 1, 0));
    geometry.setAttribute("instanceDistanceEnd", new InterleavedBufferAttribute(instanceDistanceBuffer, 1, 1));
    return this;
  }
}
export { Wireframe };
