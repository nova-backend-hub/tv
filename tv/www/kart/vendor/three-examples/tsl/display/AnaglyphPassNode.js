import { Matrix3, NodeMaterial, Vector3 } from "three/webgpu";
import { clamp, Fn, vec4, uv, uniform, max } from "three/tsl";
import StereoCompositePassNode from "./StereoCompositePassNode.js";
import { frameCorners } from "../../utils/CameraUtils.js";
const _eyeL = /* @__PURE__ */ new Vector3();
const _eyeR = /* @__PURE__ */ new Vector3();
const _screenBottomLeft = /* @__PURE__ */ new Vector3();
const _screenBottomRight = /* @__PURE__ */ new Vector3();
const _screenTopLeft = /* @__PURE__ */ new Vector3();
const _right = /* @__PURE__ */ new Vector3();
const _up = /* @__PURE__ */ new Vector3();
const _forward = /* @__PURE__ */ new Vector3();
const _screenCenter = /* @__PURE__ */ new Vector3();
const AnaglyphAlgorithm = {
  TRUE: "true",
  GREY: "grey",
  COLOUR: "colour",
  HALF_COLOUR: "halfColour",
  DUBOIS: "dubois",
  OPTIMISED: "optimised",
  COMPROMISE: "compromise"
};
const AnaglyphColorMode = {
  RED_CYAN: "redCyan",
  MAGENTA_CYAN: "magentaCyan",
  MAGENTA_GREEN: "magentaGreen"
};
const LUMINANCE = { R: 0.299, G: 0.587, B: 0.114 };
function createMatrixPair(leftSpec, rightSpec) {
  function specToColumnMajor(spec) {
    const r = spec.r || [0, 0, 0];
    const g = spec.g || [0, 0, 0];
    const b = spec.b || [0, 0, 0];
    return [
      r[0],
      g[0],
      b[0],
      // Column 0: coefficients for input R
      r[1],
      g[1],
      b[1],
      // Column 1: coefficients for input G
      r[2],
      g[2],
      b[2]
      // Column 2: coefficients for input B
    ];
  }
  return {
    left: specToColumnMajor(leftSpec),
    right: specToColumnMajor(rightSpec)
  };
}
const LUM = [LUMINANCE.R, LUMINANCE.G, LUMINANCE.B];
const ANAGLYPH_MATRICES = {
  // True Anaglyph - Red channel from left, luminance to cyan channel for right
  // Paper: Left=[R,0,0], Right=[0,0,Lum]
  [AnaglyphAlgorithm.TRUE]: {
    [AnaglyphColorMode.RED_CYAN]: createMatrixPair(
      { r: [1, 0, 0] },
      // Left: R -> outR
      { g: LUM, b: LUM }
      // Right: Lum -> outG, Lum -> outB
    ),
    [AnaglyphColorMode.MAGENTA_CYAN]: createMatrixPair(
      { r: [1, 0, 0], b: [0, 0, 0.5] },
      // Left: R -> outR, partial B -> outB
      { g: LUM, b: [0, 0, 0.5] }
      // Right: Lum -> outG, partial B
    ),
    [AnaglyphColorMode.MAGENTA_GREEN]: createMatrixPair(
      { r: [1, 0, 0], b: LUM },
      // Left: R -> outR, Lum -> outB
      { g: LUM }
      // Right: Lum -> outG
    )
  },
  // Grey Anaglyph - Luminance-based, no color, minimal ghosting
  // Paper: Left=[Lum,0,0], Right=[0,0,Lum]
  [AnaglyphAlgorithm.GREY]: {
    [AnaglyphColorMode.RED_CYAN]: createMatrixPair(
      { r: LUM },
      // Left: Lum -> outR
      { g: LUM, b: LUM }
      // Right: Lum -> outG, Lum -> outB
    ),
    [AnaglyphColorMode.MAGENTA_CYAN]: createMatrixPair(
      { r: LUM, b: [0.15, 0.29, 0.06] },
      // Left: Lum -> outR, half-Lum -> outB
      { g: LUM, b: [0.15, 0.29, 0.06] }
      // Right: Lum -> outG, half-Lum -> outB
    ),
    [AnaglyphColorMode.MAGENTA_GREEN]: createMatrixPair(
      { r: LUM, b: LUM },
      // Left: Lum -> outR, Lum -> outB
      { g: LUM }
      // Right: Lum -> outG
    )
  },
  // Colour Anaglyph - Full color, high retinal rivalry
  // Paper: Left=[R,0,0], Right=[0,G,B]
  [AnaglyphAlgorithm.COLOUR]: {
    [AnaglyphColorMode.RED_CYAN]: createMatrixPair(
      { r: [1, 0, 0] },
      // Left: R -> outR
      { g: [0, 1, 0], b: [0, 0, 1] }
      // Right: G -> outG, B -> outB
    ),
    [AnaglyphColorMode.MAGENTA_CYAN]: createMatrixPair(
      { r: [1, 0, 0], b: [0, 0, 0.5] },
      // Left: R -> outR, partial B -> outB
      { g: [0, 1, 0], b: [0, 0, 0.5] }
      // Right: G -> outG, partial B -> outB
    ),
    [AnaglyphColorMode.MAGENTA_GREEN]: createMatrixPair(
      { r: [1, 0, 0], b: [0, 0, 1] },
      // Left: R -> outR, B -> outB
      { g: [0, 1, 0] }
      // Right: G -> outG
    )
  },
  // Half-Colour Anaglyph - Luminance for left red, full color for right cyan
  // Paper: Left=[Lum,0,0], Right=[0,G,B]
  [AnaglyphAlgorithm.HALF_COLOUR]: {
    [AnaglyphColorMode.RED_CYAN]: createMatrixPair(
      { r: LUM },
      // Left: Lum -> outR
      { g: [0, 1, 0], b: [0, 0, 1] }
      // Right: G -> outG, B -> outB
    ),
    [AnaglyphColorMode.MAGENTA_CYAN]: createMatrixPair(
      { r: LUM, b: [0.15, 0.29, 0.06] },
      // Left: Lum -> outR, half-Lum -> outB
      { g: [0, 1, 0], b: [0.15, 0.29, 0.06] }
      // Right: G -> outG, half-Lum -> outB
    ),
    [AnaglyphColorMode.MAGENTA_GREEN]: createMatrixPair(
      { r: LUM, b: LUM },
      // Left: Lum -> outR, Lum -> outB
      { g: [0, 1, 0] }
      // Right: G -> outG
    )
  },
  // Dubois Anaglyph - Least-squares optimized for specific glasses
  // From https://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.7.6968&rep=rep1&type=pdf
  [AnaglyphAlgorithm.DUBOIS]: {
    [AnaglyphColorMode.RED_CYAN]: createMatrixPair(
      {
        r: [0.4561, 0.500484, 0.176381],
        g: [-0.0400822, -0.0378246, -0.0157589],
        b: [-0.0152161, -0.0205971, -546856e-8]
      },
      {
        r: [-0.0434706, -0.0879388, -155529e-8],
        g: [0.378476, 0.73364, -0.0184503],
        b: [-0.0721527, -0.112961, 1.2264]
      }
    ),
    [AnaglyphColorMode.MAGENTA_CYAN]: createMatrixPair(
      {
        r: [0.4561, 0.500484, 0.176381],
        g: [-0.0400822, -0.0378246, -0.0157589],
        b: [0.088, 0.088, -3e-3]
      },
      {
        r: [-0.0434706, -0.0879388, -155529e-8],
        g: [0.378476, 0.73364, -0.0184503],
        b: [0.088, 0.088, 0.613]
      }
    ),
    [AnaglyphColorMode.MAGENTA_GREEN]: createMatrixPair(
      {
        r: [0.4561, 0.500484, 0.176381],
        b: [-0.0434706, -0.0879388, -155529e-8]
      },
      {
        g: [0.378476 + 0.4561, 0.73364 + 0.500484, -0.0184503 + 0.176381]
      }
    )
  },
  // Optimised Anaglyph - Improved color with reduced retinal rivalry
  // Paper: Left=[0,0.7G+0.3B,0,0], Right=[0,G,B]
  [AnaglyphAlgorithm.OPTIMISED]: {
    [AnaglyphColorMode.RED_CYAN]: createMatrixPair(
      { r: [0, 0.7, 0.3] },
      // Left: 0.7G+0.3B -> outR
      { g: [0, 1, 0], b: [0, 0, 1] }
      // Right: G -> outG, B -> outB
    ),
    [AnaglyphColorMode.MAGENTA_CYAN]: createMatrixPair(
      { r: [0, 0.7, 0.3], b: [0, 0, 0.5] },
      // Left: 0.7G+0.3B -> outR, partial B
      { g: [0, 1, 0], b: [0, 0, 0.5] }
      // Right: G -> outG, partial B
    ),
    [AnaglyphColorMode.MAGENTA_GREEN]: createMatrixPair(
      { r: [0, 0.7, 0.3], b: [0, 0, 1] },
      // Left: 0.7G+0.3B -> outR, B -> outB
      { g: [0, 1, 0] }
      // Right: G -> outG
    )
  },
  // Compromise Anaglyph - Best balance of color and stereo effect
  // From Ahtik, J., "Techniques of Rendering Anaglyphs for Use in Art"
  // Paper matrix [8]: Left=[0.439R+0.447G+0.148B, 0, 0], Right=[0, 0.095R+0.934G+0.005B, 0.018R+0.028G+1.057B]
  [AnaglyphAlgorithm.COMPROMISE]: {
    [AnaglyphColorMode.RED_CYAN]: createMatrixPair(
      { r: [0.439, 0.447, 0.148] },
      // Left: weighted RGB -> outR
      {
        g: [0.095, 0.934, 5e-3],
        // Right: weighted RGB -> outG
        b: [0.018, 0.028, 1.057]
        // Right: weighted RGB -> outB
      }
    ),
    [AnaglyphColorMode.MAGENTA_CYAN]: createMatrixPair(
      {
        r: [0.439, 0.447, 0.148],
        b: [9e-3, 0.014, 0.074]
        // Partial blue from left
      },
      {
        g: [0.095, 0.934, 5e-3],
        b: [9e-3, 0.014, 0.528]
        // Partial blue from right
      }
    ),
    [AnaglyphColorMode.MAGENTA_GREEN]: createMatrixPair(
      {
        r: [0.439, 0.447, 0.148],
        b: [0.018, 0.028, 1.057]
      },
      {
        g: [0.095 + 0.439, 0.934 + 0.447, 5e-3 + 0.148]
      }
    )
  }
};
class AnaglyphPassNode extends StereoCompositePassNode {
  static get type() {
    return "AnaglyphPassNode";
  }
  /**
   * Constructs a new anaglyph pass node.
   *
   * @param {Scene} scene - The scene to render.
   * @param {Camera} camera - The camera to render the scene with.
   */
  constructor(scene, camera) {
    super(scene, camera);
    this.isAnaglyphPassNode = true;
    this.eyeSep = 0.064;
    this.planeDistance = 0.5;
    this._algorithm = AnaglyphAlgorithm.DUBOIS;
    this._colorMode = AnaglyphColorMode.RED_CYAN;
    this._colorMatrixLeft = uniform(new Matrix3());
    this._colorMatrixRight = uniform(new Matrix3());
    this._updateMatrices();
  }
  /**
   * Gets the current anaglyph algorithm.
   *
   * @type {string}
   */
  get algorithm() {
    return this._algorithm;
  }
  /**
   * Sets the anaglyph algorithm.
   *
   * @type {string}
   */
  set algorithm(value) {
    if (this._algorithm !== value) {
      this._algorithm = value;
      this._updateMatrices();
    }
  }
  /**
   * Gets the current color mode.
   *
   * @type {string}
   */
  get colorMode() {
    return this._colorMode;
  }
  /**
   * Sets the color mode.
   *
   * @type {string}
   */
  set colorMode(value) {
    if (this._colorMode !== value) {
      this._colorMode = value;
      this._updateMatrices();
    }
  }
  /**
   * Updates the color matrices based on current algorithm and color mode.
   *
   * @private
   */
  _updateMatrices() {
    const matrices = ANAGLYPH_MATRICES[this._algorithm][this._colorMode];
    this._colorMatrixLeft.value.fromArray(matrices.left);
    this._colorMatrixRight.value.fromArray(matrices.right);
  }
  /**
   * Updates the internal stereo camera using frameCorners for
   * physically-correct off-axis projection.
   *
   * @param {number} coordinateSystem - The current coordinate system.
   */
  updateStereoCamera(coordinateSystem) {
    const { stereo, camera } = this;
    stereo.cameraL.coordinateSystem = coordinateSystem;
    stereo.cameraR.coordinateSystem = coordinateSystem;
    camera.matrixWorld.extractBasis(_right, _up, _forward);
    _right.normalize();
    _up.normalize();
    _forward.normalize();
    const halfSep = this.eyeSep / 2;
    _eyeL.copy(camera.position).addScaledVector(_right, -halfSep);
    _eyeR.copy(camera.position).addScaledVector(_right, halfSep);
    _screenCenter.copy(camera.position).addScaledVector(_forward, -this.planeDistance);
    const DEG2RAD = Math.PI / 180;
    const halfHeight = this.planeDistance * Math.tan(DEG2RAD * camera.fov / 2);
    const halfWidth = halfHeight * camera.aspect;
    _screenBottomLeft.copy(_screenCenter).addScaledVector(_right, -halfWidth).addScaledVector(_up, -halfHeight);
    _screenBottomRight.copy(_screenCenter).addScaledVector(_right, halfWidth).addScaledVector(_up, -halfHeight);
    _screenTopLeft.copy(_screenCenter).addScaledVector(_right, -halfWidth).addScaledVector(_up, halfHeight);
    stereo.cameraL.position.copy(_eyeL);
    stereo.cameraL.near = camera.near;
    stereo.cameraL.far = camera.far;
    frameCorners(stereo.cameraL, _screenBottomLeft, _screenBottomRight, _screenTopLeft, true);
    stereo.cameraL.matrixWorld.compose(stereo.cameraL.position, stereo.cameraL.quaternion, stereo.cameraL.scale);
    stereo.cameraL.matrixWorldInverse.copy(stereo.cameraL.matrixWorld).invert();
    stereo.cameraR.position.copy(_eyeR);
    stereo.cameraR.near = camera.near;
    stereo.cameraR.far = camera.far;
    frameCorners(stereo.cameraR, _screenBottomLeft, _screenBottomRight, _screenTopLeft, true);
    stereo.cameraR.matrixWorld.compose(stereo.cameraR.position, stereo.cameraR.quaternion, stereo.cameraR.scale);
    stereo.cameraR.matrixWorldInverse.copy(stereo.cameraR.matrixWorld).invert();
  }
  /**
   * This method is used to setup the effect's TSL code.
   *
   * @param {NodeBuilder} builder - The current node builder.
   * @return {PassTextureNode}
   */
  setup(builder) {
    const uvNode = uv();
    const anaglyph = Fn(() => {
      const colorL = this._mapLeft.sample(uvNode);
      const colorR = this._mapRight.sample(uvNode);
      const color = clamp(this._colorMatrixLeft.mul(colorL.rgb).add(this._colorMatrixRight.mul(colorR.rgb)));
      return vec4(color.rgb, max(colorL.a, colorR.a));
    });
    const material = this._material || (this._material = new NodeMaterial());
    material.fragmentNode = anaglyph().context(builder.getSharedContext());
    material.name = "Anaglyph";
    material.needsUpdate = true;
    return super.setup(builder);
  }
}
export default AnaglyphPassNode;
export { AnaglyphAlgorithm, AnaglyphColorMode };
export const anaglyphPass = (scene, camera) => new AnaglyphPassNode(scene, camera);
