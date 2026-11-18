import {
  Group,
  Matrix4
} from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { cameraPosition, color, float, floor, Fn, fract, fwidth, hash, If, mix, mod, mx_fractal_noise_float, mx_noise_float, normalView, positionView, positionWorld, smoothstep, step, uint, varying, vec4 } from "three/tsl";
import { SkyscraperGenerator, createSkyscraperMaterial, buildingPalette } from "./city/SkyscraperGenerator.js";
import { SidewalkGenerator } from "./city/SidewalkGenerator.js";
class CityGenerator {
  constructor(parameters = {}) {
    this.parameters = Object.assign({}, CityGenerator.defaults, parameters);
    this.layout = cityLayout(this.parameters);
    this.generators = [];
    this.sidewalk = new SidewalkGenerator({
      width: this.layout.blockW,
      depth: this.layout.blockD,
      height: this.parameters.curbHeight,
      radius: this.parameters.curbRadius
    });
    this.group = null;
  }
  build(materials = {}) {
    this.dispose();
    const group = new Group();
    group.name = "City";
    const L = this.layout;
    const random = createRandom(this.parameters.seed);
    const curb = this.parameters.curbHeight;
    const slabs = [];
    for (let bx = 0; bx < L.blocksX; bx++) {
      for (let bz = 0; bz < L.blocksZ; bz++) {
        const blockX = -L.cityW / 2 + bx * (L.blockW + L.street);
        const blockZ = -L.cityD / 2 + bz * (L.blockD + L.street);
        if (curb > 0) {
          slabs.push(new Matrix4().makeTranslation(blockX + L.blockW / 2, 0, blockZ + L.blockD / 2));
        }
        for (let lx = 0; lx < L.lotsX; lx++) {
          for (let lz = 0; lz < L.lotsZ; lz++) {
            const cornerX = lx === 0 ? -1 : lx === L.lotsX - 1 ? 1 : 0;
            const cornerZ = lz === 0 ? -1 : lz === L.lotsZ - 1 ? 1 : 0;
            const onCorner = cornerX !== 0 && cornerZ !== 0;
            const tall = random();
            const generator = new SkyscraperGenerator({
              seed: Math.floor(random() * 1e5),
              totalHeight: 38 + tall * tall * 114,
              // a few tall towers, mostly mid-rise
              footprint: { width: L.lot - 1 - random() * 4, depth: L.lot - 1 - random() * 4 },
              // nearly fill the lot so neighbours sit close; width and depth vary independently
              floorHeight: 3.4 + random() * 1.8,
              bayWidth: 1.9 + random() * 2.1,
              pierWidth: 0.4 + random() * 0.5,
              pierDepth: 0.3 + random() * 0.4,
              chamferWidth: onCorner ? 3 + random() * 4 : 0,
              chamferCornerX: cornerX,
              chamferCornerZ: cornerZ,
              setbackDepth: random() < 0.4 ? 0.8 + random() * 2 : 0,
              // only some towers step back at the crown; the rest rise flat
              stringCourseEvery: random() < 0.85 ? 3 + Math.floor(random() * 6) : 0
            }, materials.building);
            const building = generator.build();
            building.position.set(blockX + (lx + 0.5) * L.lot, curb, blockZ + (lz + 0.5) * L.lot);
            building.castShadow = building.receiveShadow = true;
            group.add(building);
            this.generators.push(generator);
          }
        }
      }
    }
    if (slabs.length > 0) group.add(this.sidewalk.build(slabs));
    this.group = group;
    return group;
  }
  dispose() {
    for (const generator of this.generators) generator.dispose();
    this.generators.length = 0;
    this.sidewalk.dispose();
    this.group = null;
  }
}
CityGenerator.defaults = {
  seed: 1,
  street: 22,
  lot: 30,
  lotsX: 3,
  lotsZ: 2,
  blocksX: 2,
  blocksZ: 2,
  curbHeight: 0.15,
  // ~6 in standard curb reveal / sidewalk height above the road
  curbRadius: 5
};
function cityLayout(parameters) {
  const { street, lot, lotsX, lotsZ, blocksX, blocksZ } = parameters;
  const blockW = lotsX * lot;
  const blockD = lotsZ * lot;
  return {
    street,
    lot,
    lotsX,
    lotsZ,
    blocksX,
    blocksZ,
    blockW,
    blockD,
    cityW: blocksX * blockW + (blocksX - 1) * street,
    cityD: blocksZ * blockD + (blocksZ - 1) * street
  };
}
function createRandom(seed) {
  let s = seed >>> 0 || 1;
  return function() {
    s = s + 1831565813 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
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
function lineAA(coord, halfWidth) {
  const aa = fwidth(coord).max(1e-4);
  return smoothstep(float(halfWidth).add(aa), float(halfWidth).sub(aa), coord.abs());
}
function gridLine(coord, period, halfWidth) {
  const g = coord.div(period);
  const d = float(0.5).sub(fract(g).sub(0.5).abs());
  const aa = fwidth(g).max(1e-4);
  const hw = halfWidth / period;
  return smoothstep(float(hw).add(aa), float(hw).sub(aa), d);
}
function createBuildingMaterial(layout, seed = 0) {
  const palette = buildingPalette.map((hex) => color(hex));
  const periodX = layout.blockW + layout.street;
  const periodZ = layout.blockD + layout.street;
  const gx = positionWorld.x.add(layout.cityW / 2);
  const gz = positionWorld.z.add(layout.cityD / 2);
  const blockIX = floor(gx.div(periodX));
  const blockIZ = floor(gz.div(periodZ));
  const cellX = blockIX.mul(layout.lotsX).add(floor(gx.sub(blockIX.mul(periodX)).div(layout.lot)));
  const cellZ = blockIZ.mul(layout.lotsZ).add(floor(gz.sub(blockIZ.mul(periodZ)).div(layout.lot)));
  const cellKey = uint(cellX.add(4096)).mul(uint(73856093)).bitXor(uint(cellZ.add(4096)).mul(uint(19349663))).bitXor(uint(seed * 2654435761 >>> 0)).toVar();
  const cellHash = (a, b) => hash(cellKey.add(uint(Math.round((a + b * 7) * 100))));
  const pick = cellHash(127.1, 311.7);
  let buildingBase = palette[0];
  for (let i = 1; i < palette.length; i++) buildingBase = mix(buildingBase, palette[i], step(i / palette.length, pick));
  buildingBase = buildingBase.mul(cellHash(269.5, 183.3).mul(0.12).add(0.94));
  return createSkyscraperMaterial(varying(buildingBase));
}
function createRoadMaterial(layout) {
  const p = positionWorld;
  const detail = smoothstep(240, 25, p.distance(cameraPosition));
  const blotch = mx_fractal_noise_float(p.mul(0.2), 3).mul(0.5).add(0.5);
  const near = Fn(() => {
    const grit2 = float(0).toVar();
    const stain2 = float(0).toVar();
    const crack2 = float(0).toVar();
    const worn2 = float(1).toVar();
    If(detail.greaterThan(0), () => {
      grit2.assign(mx_noise_float(p.mul(7)).add(mx_noise_float(p.mul(23))).mul(0.5));
      stain2.assign(smoothstep(0.5, 0.85, mx_fractal_noise_float(p.mul(0.45), 3).mul(0.5).add(0.5)));
      crack2.assign(smoothstep(0.88, 1, mx_fractal_noise_float(p.mul(1.1), 4).abs().oneMinus()).mul(detail));
      worn2.assign(smoothstep(0.25, 0.7, mx_fractal_noise_float(p.mul(0.7), 3).mul(0.5).add(0.5)).mul(0.55).add(0.35));
    });
    return vec4(grit2, stain2, crack2, worn2);
  })();
  const grit = near.x;
  const stain = near.y;
  const crack = near.z;
  const worn = near.w;
  const base = mix(color(2369067), color(3882822), blotch);
  const gritty = base.mul(grit.mul(0.22).mul(detail).add(1));
  const asphalt = mix(gritty, gritty.mul(0.5), stain.mul(0.5).mul(detail));
  const wet = smoothstep(0.6, 0.85, mx_fractal_noise_float(p.mul(0.14), 2).mul(0.5).add(0.5));
  const periodX = layout.blockW + layout.street;
  const periodZ = layout.blockD + layout.street;
  const fx = mod(p.x.add(layout.cityW / 2), periodX);
  const fz = mod(p.z.add(layout.cityD / 2), periodZ);
  const inStreetX = step(layout.blockW, fx);
  const inStreetZ = step(layout.blockD, fz);
  const su = fx.sub(layout.blockW);
  const sv = fz.sub(layout.blockD);
  const dashV = step(fract(p.z.div(7)), 0.5);
  const dashH = step(fract(p.x.div(7)), 0.5);
  const centreV = lineAA(su.sub(layout.street / 2), 0.12);
  const dividerV = lineAA(su.sub(layout.street / 4), 0.1).max(lineAA(su.sub(layout.street * 3 / 4), 0.1)).mul(dashV);
  const laneV = centreV.max(dividerV).mul(inStreetX).mul(inStreetZ.oneMinus());
  const centreH = lineAA(sv.sub(layout.street / 2), 0.12);
  const dividerH = lineAA(sv.sub(layout.street / 4), 0.1).max(lineAA(sv.sub(layout.street * 3 / 4), 0.1)).mul(dashH);
  const laneH = centreH.max(dividerH).mul(inStreetZ).mul(inStreetX.oneMinus());
  const cw = 5;
  const nearZ = step(fz, cw).max(step(layout.blockD - cw, fz));
  const nearX = step(fx, cw).max(step(layout.blockW - cw, fx));
  const crossV = gridLine(su, 1.2, 0.38).mul(inStreetX).mul(inStreetZ.oneMinus()).mul(nearZ);
  const crossH = gridLine(sv, 1.2, 0.38).mul(inStreetZ).mul(inStreetX.oneMinus()).mul(nearX);
  const paint = laneV.max(laneH).max(crossV).max(crossH).mul(detail).mul(worn);
  const material = new MeshStandardNodeMaterial();
  const surface = mix(asphalt, asphalt.mul(0.6), wet).mul(crack.mul(0.5).oneMinus());
  material.colorNode = mix(surface, color(13683904), paint);
  material.roughnessNode = mix(float(0.95).sub(paint.mul(0.2)), float(0.32), wet);
  material.normalNode = bumpNormal(grit.mul(3e-3).sub(crack.mul(0.01)).mul(detail));
  return material;
}
export { CityGenerator, createBuildingMaterial, createRoadMaterial };
