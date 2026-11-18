import {
  AdditiveBlending,
  Box2,
  BufferGeometry,
  Color,
  FramebufferTexture,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  MeshBasicNodeMaterial,
  NodeMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  Node
} from "three/webgpu";
import { texture, textureLoad, uv, ivec2, vec2, vec4, positionGeometry, reference, varyingProperty, materialReference, Fn } from "three/tsl";
class LensflareMesh extends Mesh {
  /**
   * Constructs a new lensflare mesh.
   */
  constructor() {
    super(LensflareMesh.Geometry, new MeshBasicNodeMaterial({ opacity: 0, transparent: true }));
    this.isLensflareMesh = true;
    this.type = "LensflareMesh";
    this.frustumCulled = false;
    this.renderOrder = Infinity;
    const positionView = new Vector3();
    const tempMap = new FramebufferTexture(16, 16);
    const occlusionMap = new FramebufferTexture(16, 16);
    let currentType = UnsignedByteType;
    const geometry = LensflareMesh.Geometry;
    const sharedValues = {
      scale: new Vector2(),
      positionScreen: new Vector3()
    };
    const scale = reference("scale", "vec2", sharedValues);
    const screenPosition = reference("positionScreen", "vec3", sharedValues);
    const vertexNode = vec4(positionGeometry.xy.mul(scale).add(screenPosition.xy), screenPosition.z, 1);
    const material1a = new NodeMaterial();
    material1a.depthTest = true;
    material1a.depthWrite = false;
    material1a.transparent = false;
    material1a.fog = false;
    material1a.type = "Lensflare-1a";
    material1a.vertexNode = vertexNode;
    material1a.colorNode = vec4(1, 0, 1, 1);
    const material1b = new NodeMaterial();
    material1b.depthTest = false;
    material1b.depthWrite = false;
    material1b.transparent = false;
    material1b.fog = false;
    material1b.type = "Lensflare-1b";
    material1b.vertexNode = vertexNode;
    material1b.colorNode = texture(tempMap, vec2(uv().flipY()));
    const mesh1 = new Mesh(geometry, material1a);
    const elements = [];
    const elementMeshes = [];
    const material2 = new NodeMaterial();
    material2.transparent = true;
    material2.blending = AdditiveBlending;
    material2.depthWrite = false;
    material2.depthTest = false;
    material2.fog = false;
    material2.type = "Lensflare-2";
    material2.screenPosition = new Vector3();
    material2.scale = new Vector2();
    material2.occlusionMap = occlusionMap;
    material2.vertexNode = Fn(({ material }) => {
      const scale2 = materialReference("scale", "vec2");
      const screenPosition2 = materialReference("screenPosition", "vec3");
      const occlusionMap2 = material.occlusionMap;
      const pos = positionGeometry.xy.toVar();
      const visibility = textureLoad(occlusionMap2, ivec2(2, 2)).toVar();
      visibility.addAssign(textureLoad(occlusionMap2, ivec2(8, 2)));
      visibility.addAssign(textureLoad(occlusionMap2, ivec2(14, 2)));
      visibility.addAssign(textureLoad(occlusionMap2, ivec2(14, 8)));
      visibility.addAssign(textureLoad(occlusionMap2, ivec2(14, 14)));
      visibility.addAssign(textureLoad(occlusionMap2, ivec2(8, 14)));
      visibility.addAssign(textureLoad(occlusionMap2, ivec2(2, 14)));
      visibility.addAssign(textureLoad(occlusionMap2, ivec2(2, 8)));
      visibility.addAssign(textureLoad(occlusionMap2, ivec2(8, 8)));
      const vVisibility = varyingProperty("float", "vVisibility");
      vVisibility.assign(visibility.r.div(9));
      vVisibility.mulAssign(visibility.g.div(9).oneMinus());
      vVisibility.mulAssign(visibility.b.div(9));
      return vec4(pos.mul(scale2).add(screenPosition2.xy).xy, screenPosition2.z, 1);
    })();
    material2.colorNode = Fn(() => {
      const color = reference("color", "color");
      const map = reference("map", "texture");
      const vVisibility = varyingProperty("float", "vVisibility");
      const output = map.toVar();
      output.a.mulAssign(vVisibility);
      output.rgb.mulAssign(color);
      return output;
    })();
    this.addElement = function(element) {
      elements.push(element);
    };
    const positionScreen = sharedValues.positionScreen;
    const screenPositionPixels = new Vector4(0, 0, 16, 16);
    const validArea = new Box2();
    const viewport = new Vector4();
    const lightsNode = new Node();
    this.onBeforeRender = (renderer, scene, camera) => {
      renderer.getViewport(viewport);
      viewport.multiplyScalar(renderer.getPixelRatio()).floor();
      const renderTarget = renderer.getRenderTarget();
      const type = renderTarget !== null ? renderTarget.texture.type : UnsignedByteType;
      if (currentType !== type) {
        tempMap.dispose();
        occlusionMap.dispose();
        tempMap.type = occlusionMap.type = type;
        currentType = type;
      }
      const invAspect = viewport.w / viewport.z;
      const halfViewportWidth = viewport.z / 2;
      const halfViewportHeight = viewport.w / 2;
      const size = 16 / viewport.w;
      sharedValues.scale.set(size * invAspect, size);
      validArea.min.set(viewport.x, viewport.y);
      validArea.max.set(viewport.x + (viewport.z - 16), viewport.y + (viewport.w - 16));
      positionView.setFromMatrixPosition(this.matrixWorld);
      positionView.applyMatrix4(camera.matrixWorldInverse);
      if (positionView.z > 0) return;
      positionScreen.copy(positionView).applyMatrix4(camera.projectionMatrix);
      screenPositionPixels.x = viewport.x + positionScreen.x * halfViewportWidth + halfViewportWidth - 8;
      screenPositionPixels.y = viewport.y - positionScreen.y * halfViewportHeight + halfViewportHeight - 8;
      if (validArea.containsPoint(screenPositionPixels)) {
        renderer.copyFramebufferToTexture(tempMap, screenPositionPixels);
        renderer.renderObject(mesh1, scene, camera, geometry, material1a, null, lightsNode);
        renderer.copyFramebufferToTexture(occlusionMap, screenPositionPixels);
        renderer.renderObject(mesh1, scene, camera, geometry, material1b, null, lightsNode);
        const vecX = -positionScreen.x * 2;
        const vecY = -positionScreen.y * 2;
        for (let i = 0, l = elements.length; i < l; i++) {
          const element = elements[i];
          let mesh2 = elementMeshes[i];
          if (mesh2 === void 0) {
            mesh2 = elementMeshes[i] = new Mesh(geometry, material2);
            mesh2.color = element.color.convertSRGBToLinear();
            mesh2.map = element.texture;
          }
          material2.screenPosition.x = positionScreen.x + vecX * element.distance;
          material2.screenPosition.y = positionScreen.y - vecY * element.distance;
          material2.screenPosition.z = positionScreen.z;
          const size2 = element.size / viewport.w;
          material2.scale.set(size2 * invAspect, size2);
          renderer.renderObject(mesh2, scene, camera, geometry, material2, null, lightsNode);
        }
      }
    };
    this.dispose = function() {
      material1a.dispose();
      material1b.dispose();
      material2.dispose();
      tempMap.dispose();
      occlusionMap.dispose();
      for (let i = 0, l = elements.length; i < l; i++) {
        elements[i].texture.dispose();
      }
    };
  }
}
class LensflareElement {
  constructor(texture2, size = 1, distance = 0, color = new Color(16777215)) {
    this.texture = texture2;
    this.size = size;
    this.distance = distance;
    this.color = color;
  }
}
LensflareMesh.Geometry = (function() {
  const geometry = new BufferGeometry();
  const float32Array = new Float32Array([
    -1,
    -1,
    0,
    0,
    0,
    1,
    -1,
    0,
    1,
    0,
    1,
    1,
    0,
    1,
    1,
    -1,
    1,
    0,
    0,
    1
  ]);
  const interleavedBuffer = new InterleavedBuffer(float32Array, 5);
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute("position", new InterleavedBufferAttribute(interleavedBuffer, 3, 0, false));
  geometry.setAttribute("uv", new InterleavedBufferAttribute(interleavedBuffer, 2, 3, false));
  return geometry;
})();
export { LensflareMesh, LensflareElement };
