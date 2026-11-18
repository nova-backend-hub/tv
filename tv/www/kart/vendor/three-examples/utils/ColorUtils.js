import { MathUtils, SRGBColorSpace } from "three";
function setKelvin(color, kelvin) {
  const temp = MathUtils.clamp(kelvin, 1e3, 4e4) / 100;
  let r, g, b;
  if (temp <= 66) {
    r = 255;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
  }
  if (temp <= 66) {
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
  } else {
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
  }
  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  }
  return color.setRGB(
    MathUtils.clamp(r, 0, 255) / 255,
    MathUtils.clamp(g, 0, 255) / 255,
    MathUtils.clamp(b, 0, 255) / 255,
    SRGBColorSpace
  );
}
export { setKelvin };
