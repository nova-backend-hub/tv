import * as T from "three";
const material = (color) => new T.MeshStandardMaterial({ color, roughness: 0.42 });
function mesh(g, geometry, mat, x = 0, y = 0, z = 0) {
  const m = new T.Mesh(geometry, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}
function eyes(g, y, z, size = 1) {
  for (const x of [-0.16, 0.16]) {
    const e = mesh(g, new T.SphereGeometry(1, 16, 12), material("#161319"), x * size, y, z);
    e.scale.set(0.055 * size, 0.16 * size, 0.035 * size);
  }
}
export function makeItemModel(type) {
  const g = new T.Group();
  g.name = "item-" + type;
  if (type === "banana") {
    const yellow = material("#ffdc21"), inside = material("#fff4a3");
    const body = mesh(g, new T.SphereGeometry(0.24, 24, 16), yellow, 0, 0.62, 0);
    body.scale.set(1, 2.2, 1);
    const tip = mesh(g, new T.CylinderGeometry(0.055, 0.1, 0.32, 12), material("#75662b"), 0, 1.18, 0);
    tip.rotation.z = -0.22;
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI * 2 / 3, curve = new T.CatmullRomCurve3([new T.Vector3(0, 0.6, 0), new T.Vector3(Math.sin(a) * 0.28, 0.38, Math.cos(a) * 0.28), new T.Vector3(Math.sin(a) * 0.62, 0.09, Math.cos(a) * 0.62), new T.Vector3(Math.sin(a) * 0.83, 0.16, Math.cos(a) * 0.83)]);
      const p = [], idx = [];
      for (let i = 0; i <= 20; i++) {
        const t = i / 20, c = curve.getPoint(t), w = 0.17 * Math.sin(Math.PI * t) ** 0.5 + 0.015;
        for (const side of [-1, 1]) p.push(c.x + Math.cos(a) * side * w, c.y, c.z - Math.sin(a) * side * w);
        if (i < 20) {
          const n = i * 2;
          idx.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
        }
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.Float32BufferAttribute(p, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mat = inside.clone();
      mat.side = T.DoubleSide;
      mesh(g, geo, mat);
    }
    eyes(g, 0.73, 0.225, 0.72);
  } else if (type === "star") {
    const shape = new T.Shape();
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5, r = i % 2 ? 0.32 : 0.7, x = Math.sin(a) * r, y = Math.cos(a) * r + 0.7;
      i ? shape.lineTo(x, y) : shape.moveTo(x, y);
    }
    shape.closePath();
    const m = mesh(g, new T.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 3, steps: 1 }), material("#ffe740"));
    m.material.emissive.set("#806700");
    eyes(g, 0.73, 0.28, 0.8);
  } else {
    const color = type === "green" ? "#26ae36" : type === "red" ? "#e92936" : "#178bf0";
    const mat = material(color), shell = mesh(g, new T.SphereGeometry(0.67, 48, 28, 0, Math.PI * 2, 0, Math.PI / 2), mat, 0, 0.27, 0);
    shell.scale.y = 0.85;
    const seam = material(type === "green" ? "#125b23" : type === "red" ? "#8b1427" : "#084e94");
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3, pts = [];
      for (let i = 0; i <= 18; i++) {
        const t = 0.67 + i / 18 * (Math.PI / 2 - 0.67);
        pts.push(new T.Vector3(Math.sin(a) * Math.sin(t) * 0.674, 0.27 + Math.cos(t) * 0.575, Math.cos(a) * Math.sin(t) * 0.674));
      }
      mesh(g, new T.TubeGeometry(new T.CatmullRomCurve3(pts), 18, 0.014, 5, false), seam);
    }
    const seamRing = mesh(g, new T.TorusGeometry(Math.sin(0.67) * 0.674, 0.014, 5, 48), seam, 0, 0.27 + Math.cos(0.67) * 0.575, 0);
    seamRing.rotation.x = Math.PI / 2;
    const rim = mesh(g, new T.TorusGeometry(0.64, 0.105, 12, 48), material("#fff7db"), 0, 0.25, 0);
    rim.rotation.x = Math.PI / 2;
    const belly = mesh(g, new T.SphereGeometry(0.52, 32, 18), material("#ffd987"), 0, 0.16, 0);
    belly.scale.y = 0.5;
    const face = mesh(g, new T.SphereGeometry(0.26, 24, 16), material("#ffdfa0"), 0, 0.13, 0.43);
    face.scale.set(1, 0.82, 0.72);
    eyes(g, 0.15, 0.6, 0.6);
    if (type === "blue") {
      mesh(g, new T.ConeGeometry(0.13, 0.45, 16), material("#fffbea"), 0, 1.02, 0);
      for (const a of [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5]) {
        const spike = mesh(g, new T.ConeGeometry(0.12, 0.4, 16), material("#fffbea"), Math.sin(a) * 0.38, 0.87, Math.cos(a) * 0.38);
        spike.rotation.z = -Math.sin(a) * 0.5;
        spike.rotation.x = Math.cos(a) * 0.5;
      }
    }
  }
  return g;
}
