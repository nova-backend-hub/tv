import {
  BackSide,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Scene
} from "three";
class ColorEnvironment extends Scene {
  /**
   * Constructs a new color environment.
   *
   * @param {number|Color} color - The color of the environment.
   */
  constructor(color = 16777215) {
    super();
    this.name = "ColorEnvironment";
    const geometry = new SphereGeometry(1, 16, 16);
    const material = new MeshBasicMaterial({ color, side: BackSide });
    this.add(new Mesh(geometry, material));
  }
  /**
   * Frees internal resources. This method should be called
   * when the environment is no longer required.
   */
  dispose() {
    this.children[0].geometry.dispose();
    this.children[0].material.dispose();
  }
}
export { ColorEnvironment };
