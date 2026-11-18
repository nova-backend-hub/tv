import * as THREE from "../../../build/three.module.js";
let camera, scene, renderer, group;
function init(canvas, width, height, pixelRatio, path) {
  camera = new THREE.PerspectiveCamera(40, width / height, 1, 1e3);
  camera.position.z = 200;
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(4473958, 100, 400);
  scene.background = new THREE.Color(4473958);
  group = new THREE.Group();
  scene.add(group);
  const loader = new THREE.ImageBitmapLoader().setPath(path);
  loader.setOptions({ imageOrientation: "flipY" });
  loader.load("textures/matcaps/matcap-porcelain-white.jpg", function(imageBitmap) {
    const texture = new THREE.CanvasTexture(imageBitmap);
    const geometry = new THREE.IcosahedronGeometry(5, 8);
    const materials = [
      new THREE.MeshMatcapMaterial({ color: 11150559, matcap: texture }),
      new THREE.MeshMatcapMaterial({ color: 6315408, matcap: texture }),
      new THREE.MeshMatcapMaterial({ color: 14699071, matcap: texture }),
      new THREE.MeshMatcapMaterial({ color: 14877782, matcap: texture })
    ];
    for (let i = 0; i < 100; i++) {
      const material = materials[i % materials.length];
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.x = random() * 200 - 100;
      mesh.position.y = random() * 200 - 100;
      mesh.position.z = random() * 200 - 100;
      mesh.scale.setScalar(random() + 1);
      group.add(mesh);
    }
    renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    animate();
  });
}
function animate() {
  group.rotation.y = -Date.now() / 4e3;
  renderer.render(scene, camera);
  if (self.requestAnimationFrame) {
    self.requestAnimationFrame(animate);
  } else {
  }
}
let seed = 1;
function random() {
  const x = Math.sin(seed++) * 1e4;
  return x - Math.floor(x);
}
export default init;
