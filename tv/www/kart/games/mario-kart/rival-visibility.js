import * as THREE from "three";
const bodies = /* @__PURE__ */ new WeakMap();
const eye = new THREE.Vector3();
export function rivalBodyBounds(model) {
  if (bodies.has(model)) return bodies.get(model);
  model.updateWorldMatrix(true, false);
  model.updateMatrixWorld(true);
  const inverse = model.matrixWorld.clone().invert();
  const bounds = new THREE.Box3(), point = new THREE.Vector3();
  model.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.visible) return;
    if (mesh.isSkinnedMesh) mesh.skeleton.update();
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
      bounds.expandByPoint(point);
    }
  });
  bodies.set(model, bounds);
  return bounds;
}
export function rivalVisible(model, camera) {
  const bounds = rivalBodyBounds(model);
  model.updateWorldMatrix(true, false);
  model.worldToLocal(eye.copy(camera.position));
  return bounds.distanceToPoint(eye) > camera.near * 0.5;
}
