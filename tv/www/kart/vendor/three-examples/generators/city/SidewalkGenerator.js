import {
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  MeshStandardNodeMaterial,
  Shape
} from "three/webgpu";
import { cameraPosition, color, float, floor, Fn, fract, fwidth, If, mix, mx_noise_float, normalView, normalWorldGeometry, positionView, positionWorld, sin, smoothstep } from "three/tsl";
class SidewalkGenerator {
  constructor(parameters = {}) {
    this.parameters = Object.assign({}, SidewalkGenerator.defaults, parameters);
    this.material = null;
    this.curbMaterial = null;
    this.mesh = null;
  }
  build(placements) {
    this.dispose();
    const { width, depth, height, radius, curbWidth, curbLip } = this.parameters;
    if (this.material === null) this.material = createSidewalkMaterial();
    if (this.curbMaterial === null) this.curbMaterial = createCurbMaterial();
    const slab = new InstancedMesh(slabGeometry(width, depth, height, radius, curbWidth), this.material, placements.length);
    const curb = new InstancedMesh(curbGeometry(width, depth, height, radius, curbWidth, curbLip), this.curbMaterial, placements.length);
    for (let i = 0; i < placements.length; i++) {
      slab.setMatrixAt(i, placements[i]);
      curb.setMatrixAt(i, placements[i]);
    }
    slab.computeBoundingSphere();
    curb.computeBoundingSphere();
    slab.receiveShadow = curb.receiveShadow = true;
    const group = new Group();
    group.name = "Sidewalk";
    group.add(slab, curb);
    this.mesh = group;
    return group;
  }
  dispose() {
    if (this.mesh === null) return;
    this.mesh.traverse((o) => o.geometry && o.geometry.dispose());
    this.mesh = null;
  }
}
SidewalkGenerator.defaults = {
  width: 90,
  // the block footprint each slab covers
  depth: 60,
  height: 0.5,
  // walking-surface height above the road
  radius: 5,
  // corner radius, so the sidewalk turns each intersection instead of a hard 90°
  curbWidth: 0.13,
  // top width of the granite kerbstone rimming the block ( ~5 in )
  curbLip: 0.01
  // how far the curb stands proud of the walking surface ( near-flush )
};
function roundedRect(width, depth, radius) {
  const w = width / 2;
  const d = depth / 2;
  const r = Math.min(radius, w, d);
  const shape = new Shape();
  shape.moveTo(-w + r, -d);
  shape.lineTo(w - r, -d);
  shape.quadraticCurveTo(w, -d, w, -d + r);
  shape.lineTo(w, d - r);
  shape.quadraticCurveTo(w, d, w - r, d);
  shape.lineTo(-w + r, d);
  shape.quadraticCurveTo(-w, d, -w, d - r);
  shape.lineTo(-w, -d + r);
  shape.quadraticCurveTo(-w, -d, -w + r, -d);
  return shape;
}
function extrudeUp(shape, height) {
  const geometry = new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 6 });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}
function slabGeometry(width, depth, height, radius, curbWidth) {
  const innerRadius = Math.max(0.5, radius - curbWidth);
  return extrudeUp(roundedRect(width - 2 * curbWidth + 0.06, depth - 2 * curbWidth + 0.06, innerRadius), height);
}
function curbGeometry(width, depth, height, radius, curbWidth, curbLip) {
  const innerRadius = Math.max(0.5, radius - curbWidth);
  const shape = roundedRect(width, depth, radius);
  shape.holes.push(roundedRect(width - 2 * curbWidth, depth - 2 * curbWidth, innerRadius));
  return extrudeUp(shape, height + curbLip);
}
function bumpNormal(height) {
  const dpdx = positionView.dFdx();
  const dpdy = positionView.dFdy();
  const r1 = dpdy.cross(normalView);
  const r2 = normalView.cross(dpdx);
  const det = dpdx.dot(r1);
  const grad = det.sign().mul(height.dFdx().mul(r1).add(height.dFdy().mul(r2)));
  return det.abs().mul(normalView).sub(grad).normalize();
}
function gridLine(coord, period, halfWidth) {
  const g = coord.div(period);
  const d = float(0.5).sub(fract(g).sub(0.5).abs());
  const aa = fwidth(g).max(1e-4);
  const hw = halfWidth / period;
  return smoothstep(float(hw).add(aa), float(hw).sub(aa), d);
}
function detailNoise(p, detail, scale, amp) {
  return Fn(() => {
    const n = float(0).toVar();
    If(detail.greaterThan(0), () => {
      n.assign(mx_noise_float(p.mul(scale)).mul(amp));
    });
    return n;
  })();
}
function createSidewalkMaterial() {
  const p = positionWorld;
  const detail = smoothstep(200, 18, p.distance(cameraPosition));
  const panel = 1.5;
  const panelHash = fract(sin(floor(p.x.div(panel)).mul(127.1).add(floor(p.z.div(panel)).mul(311.7))).mul(43758.5453));
  const tone = mx_noise_float(p.mul(0.5)).mul(0.5).add(0.5);
  const grit = detailNoise(p, detail, 14, 0.07).mul(detail);
  const grain = detailNoise(p, detail, 3, 3e-3);
  const base = mix(color(7303016), color(9211010), tone).mul(panelHash.sub(0.5).mul(0.16).add(1));
  const concrete = base.add(grit);
  const joints = gridLine(p.x, panel, 0.045).max(gridLine(p.z, panel, 0.045)).mul(detail);
  const material = new MeshStandardNodeMaterial();
  material.colorNode = concrete.mul(joints.mul(0.45).oneMinus());
  material.roughnessNode = float(0.92).sub(panelHash.mul(0.05));
  material.normalNode = bumpNormal(grain.sub(joints.mul(0.012)).mul(detail));
  return material;
}
function createCurbMaterial() {
  const p = positionWorld;
  const detail = smoothstep(200, 18, p.distance(cameraPosition));
  const tone = mx_noise_float(p.mul(0.6)).mul(0.5).add(0.5);
  const stone = mix(color(4605503), color(6052948), tone).add(detailNoise(p, detail, 18, 0.05).mul(detail));
  const seg = 1.5;
  const joints = gridLine(p.x, seg, 0.04).max(gridLine(p.z, seg, 0.04)).mul(detail);
  const top = smoothstep(0.5, 0.85, normalWorldGeometry.y);
  const dressed = mix(stone.mul(0.7), stone, top).mul(joints.mul(0.4).oneMinus());
  const material = new MeshStandardNodeMaterial();
  material.colorNode = dressed;
  material.roughnessNode = float(0.7).add(tone.mul(0.1));
  material.normalNode = bumpNormal(detailNoise(p, detail, 4, 2e-3).mul(detail));
  return material;
}
export { SidewalkGenerator };
