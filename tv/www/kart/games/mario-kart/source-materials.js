export function finishSourceFiltering(material) {
  for (const texture of Object.values(material)) {
    if (!(texture == null ? void 0 : texture.isTexture) || texture.isRenderTargetTexture) continue;
    if (texture.anisotropy === 8) continue;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }
}
export function isSourceAsphalt(name) {
  return /^(fc_road(?:_G|_MARIOKART|_WhiteLine(?:_G)?)?|fc_ColorRoad|fc_RoadOther2(?:_G)?)$/.test(name);
}
export function finishSourceAsphalt(material) {
  var _a;
  if (!isSourceAsphalt(material.name)) return;
  const paintedLane = material.name === "fc_ColorRoad";
  material.roughness = (material.roughnessMap ? 1 : 0.52) * (paintedLane ? 1 : 0.85);
  (_a = material.normalScale) == null ? void 0 : _a.setScalar(paintedLane ? 1.1 : 2.2);
  material.color.setScalar(paintedLane ? 1 : 0.55);
}
export function finishSourceLights(material) {
  if (!material.emissiveMap) return;
  if (/^fc_(?:StadiumLight(?:_CubeMap)?|LightObj(?:\.002|_NoBake)?|nuki_[23])$/.test(material.name)) {
    material.emissiveIntensity = 3.2;
  } else if (/^fc_(?:window_[12]|Enkei_Building_(?:Plane|3D))$/.test(material.name)) {
    material.emissiveIntensity = 1.25;
  } else if (material.name === "fc_StadiumSignboard") {
    material.emissiveIntensity = 0.9;
  }
}
