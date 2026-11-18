import { Color } from "three";
class Color4 extends Color {
  constructor(r, g, b, a = 1) {
    super(r, g, b);
    this.a = a;
  }
  set(r, g, b, a = 1) {
    this.a = a;
    return super.set(r, g, b);
  }
  copy(color) {
    if (color.a !== void 0) this.a = color.a;
    return super.copy(color);
  }
  clone() {
    return new this.constructor(this.r, this.g, this.b, this.a);
  }
}
export default Color4;
