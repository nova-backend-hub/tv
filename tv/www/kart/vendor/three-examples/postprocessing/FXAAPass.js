import { FXAAShader } from "../shaders/FXAAShader.js";
import { ShaderPass } from "./ShaderPass.js";
class FXAAPass extends ShaderPass {
  /**
   * Constructs a new FXAA pass.
   */
  constructor() {
    super(FXAAShader);
  }
  /**
   * Sets the size of the pass.
   *
   * @param {number} width - The width to set.
   * @param {number} height - The height to set.
   */
  setSize(width, height) {
    this.material.uniforms["resolution"].value.set(1 / width, 1 / height);
  }
}
export { FXAAPass };
