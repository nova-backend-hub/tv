import { Line2NodeMaterial } from "three/webgpu";
import { LineSegments2 } from "./LineSegments2.js";
import { LineGeometry } from "../LineGeometry.js";
class Line2 extends LineSegments2 {
  /**
   * Constructs a new wide line.
   *
   * @param {LineGeometry} [geometry] - The line geometry.
   * @param {Line2NodeMaterial} [material] - The line material.
   */
  constructor(geometry = new LineGeometry(), material = new Line2NodeMaterial({ color: Math.random() * 16777215 })) {
    super(geometry, material);
    this.isLine2 = true;
    this.type = "Line2";
  }
}
export { Line2 };
