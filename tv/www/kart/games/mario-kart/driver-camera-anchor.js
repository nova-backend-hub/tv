import * as THREE from "three";
const anchors = /* @__PURE__ */ new WeakMap();
function measureHead(model) {
  const head = model.getObjectByName("driver-head");
  if (!head) return null;
  model.updateWorldMatrix(true, false);
  model.updateMatrixWorld(true);
  const bones = /* @__PURE__ */ new Set();
  head.traverse((o) => {
    if (o.isBone) bones.add(o);
  });
  const inverse = model.matrixWorld.clone().invert();
  const bounds = new THREE.Box3(), point = new THREE.Vector3();
  model.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.visible) return;
    let inHead = false;
    for (let p = mesh; p && p !== model; p = p.parent) if (p === head) inHead = true;
    const weight = mesh.geometry.attributes.skinWeight, index = mesh.geometry.attributes.skinIndex;
    if (!inHead && (!mesh.isSkinnedMesh || !weight || !index)) return;
    if (mesh.isSkinnedMesh) mesh.skeleton.update();
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      let headWeight = inHead ? 1 : 0;
      if (!inHead) for (let j = 0; j < 4; j++) {
        if (bones.has(mesh.skeleton.bones[index.getComponent(i, j)]))
          headWeight += weight.getComponent(i, j);
      }
      if (headWeight < 0.5) continue;
      mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
      bounds.expandByPoint(point);
    }
  });
  if (bounds.isEmpty()) return null;
  const center = bounds.getCenter(new THREE.Vector3()), crown = center.clone();
  crown.y = bounds.min.y + (bounds.max.y - bounds.min.y) * 0.9;
  return { head, point: head.worldToLocal(model.localToWorld(center)), crown: head.worldToLocal(model.localToWorld(crown)) };
}
export function driverCameraAnchor(model, fallback, upper = false) {
  if (!anchors.has(model)) anchors.set(model, measureHead(model));
  const anchor = anchors.get(model);
  if (!anchor) return fallback.clone();
  anchor.head.updateWorldMatrix(true, false);
  return anchor.head.localToWorld((upper ? anchor.crown : anchor.point).clone());
}
