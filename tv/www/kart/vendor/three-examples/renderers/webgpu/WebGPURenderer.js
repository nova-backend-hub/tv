import Renderer from "../common/Renderer.js";
import WebGLBackend from "../webgl/WebGLBackend.js";
import WebGPUBackend from "./WebGPUBackend.js";
import WebGPU from "../../capabilities/WebGPU.js";
class WebGPURenderer extends Renderer {
  constructor(parameters = {}) {
    let BackendClass;
    if (WebGPU.isAvailable()) {
      BackendClass = WebGPUBackend;
    } else {
      BackendClass = WebGLBackend;
      console.warn("THREE.WebGPURenderer: WebGPU is not available, running under WebGL2 backend.");
    }
    const backend = new BackendClass(parameters);
    super(backend, parameters);
    this.isWebGPURenderer = true;
  }
}
export default WebGPURenderer;
