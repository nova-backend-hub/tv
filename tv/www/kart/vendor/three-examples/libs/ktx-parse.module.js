const t = 0, e = 1, n = 2, i = 3, s = 0, a = 0, r = 2, o = 0, l = 1, f = 160, U = 161, c = 162, h = 163, _ = 0, p = 1, g = 0, y = 1, x = 2, u = 3, b = 4, d = 5, m = 6, w = 7, D = 8, B = 9, L = 10, A = 11, k = 12, v = 13, S = 14, I = 15, O = 16, T = 17, V = 18, E = 0, F = 1, P = 2, C = 3, z = 4, M = 5, W = 6, N = 7, H = 8, K = 9, X = 10, j = 11, R = 0, Y = 1, q = 2, G = 13, J = 14, Q = 15, Z = 128, $ = 64, tt = 32, et = 16, nt = 0, it = 1, st = 2, at = 3, rt = 4, ot = 5, lt = 6, ft = 7, Ut = 8, ct = 9, ht = 10, _t = 13, pt = 14, gt = 15, yt = 16, xt = 17, ut = 20, bt = 21, dt = 22, mt = 23, wt = 24, Dt = 27, Bt = 28, Lt = 29, At = 30, kt = 31, vt = 34, St = 35, It = 36, Ot = 37, Tt = 38, Vt = 41, Et = 42, Ft = 43, Pt = 44, Ct = 45, zt = 48, Mt = 49, Wt = 50, Nt = 58, Ht = 59, Kt = 62, Xt = 63, jt = 64, Rt = 65, Yt = 68, qt = 69, Gt = 70, Jt = 71, Qt = 74, Zt = 75, $t = 76, te = 77, ee = 78, ne = 81, ie = 82, se = 83, ae = 84, re = 85, oe = 88, le = 89, fe = 90, Ue = 91, ce = 92, he = 95, _e = 96, pe = 97, ge = 98, ye = 99, xe = 100, ue = 101, be = 102, de = 103, me = 104, we = 105, De = 106, Be = 107, Le = 108, Ae = 109, ke = 110, ve = 111, Se = 112, Ie = 113, Oe = 114, Te = 115, Ve = 116, Ee = 117, Fe = 118, Pe = 119, Ce = 120, ze = 121, Me = 122, We = 123, Ne = 124, He = 125, Ke = 126, Xe = 127, je = 128, Re = 129, Ye = 130, qe = 131, Ge = 132, Je = 133, Qe = 134, Ze = 135, $e = 136, tn = 137, en = 138, nn = 139, sn = 140, an = 141, rn = 142, on = 143, ln = 144, fn = 145, Un = 146, cn = 147, hn = 148, _n = 149, pn = 150, gn = 151, yn = 152, xn = 153, un = 154, bn = 155, dn = 156, mn = 157, wn = 158, Dn = 159, Bn = 160, Ln = 161, An = 162, kn = 163, vn = 164, Sn = 165, In = 166, On = 167, Tn = 168, Vn = 169, En = 170, Fn = 171, Pn = 172, Cn = 173, zn = 174, Mn = 175, Wn = 176, Nn = 177, Hn = 178, Kn = 179, Xn = 180, jn = 181, Rn = 182, Yn = 183, qn = 184, Gn = 1000156007, Jn = 1000156008, Qn = 1000156009, Zn = 1000156010, $n = 1000156011, ti = 1000156017, ei = 1000156018, ni = 1000156019, ii = 1000156020, si = 1000156021, ai = 1000054e3, ri = 1000054001, oi = 1000054002, li = 1000054003, fi = 1000054004, Ui = 1000054005, ci = 1000054006, hi = 1000054007, _i = 1000066e3, pi = 1000066001, gi = 1000066002, yi = 1000066003, xi = 1000066004, ui = 1000066005, bi = 1000066006, di = 1000066007, mi = 1000066008, wi = 1000066009, Di = 1000066010, Bi = 1000066011, Li = 1000066012, Ai = 1000066013, ki = 100034e4, vi = 1000340001;
class Si {
  constructor() {
    this.vkFormat = 0, this.typeSize = 1, this.pixelWidth = 0, this.pixelHeight = 0, this.pixelDepth = 0, this.layerCount = 0, this.faceCount = 1, this.supercompressionScheme = 0, this.levels = [], this.dataFormatDescriptor = [{ vendorId: 0, descriptorType: 0, descriptorBlockSize: 0, versionNumber: 2, colorModel: 0, colorPrimaries: 1, transferFunction: 2, flags: 0, texelBlockDimension: [0, 0, 0, 0], bytesPlane: [0, 0, 0, 0, 0, 0, 0, 0], samples: [] }], this.keyValue = {}, this.globalData = null;
  }
}
class Ii {
  constructor(t2, e2, n2, i2) {
    this._dataView = new DataView(t2.buffer, t2.byteOffset + e2, n2), this._littleEndian = i2, this._offset = 0;
  }
  _nextUint8() {
    const t2 = this._dataView.getUint8(this._offset);
    return this._offset += 1, t2;
  }
  _nextUint16() {
    const t2 = this._dataView.getUint16(this._offset, this._littleEndian);
    return this._offset += 2, t2;
  }
  _nextUint32() {
    const t2 = this._dataView.getUint32(this._offset, this._littleEndian);
    return this._offset += 4, t2;
  }
  _nextUint64() {
    const t2 = this._dataView.getUint32(this._offset, this._littleEndian) + 2 ** 32 * this._dataView.getUint32(this._offset + 4, this._littleEndian);
    return this._offset += 8, t2;
  }
  _nextInt32() {
    const t2 = this._dataView.getInt32(this._offset, this._littleEndian);
    return this._offset += 4, t2;
  }
  _skip(t2) {
    return this._offset += t2, this;
  }
  _scan(t2, e2 = 0) {
    const n2 = this._offset;
    let i2 = 0;
    for (; this._dataView.getUint8(this._offset) !== e2 && i2 < t2; ) i2++, this._offset++;
    return i2 < t2 && this._offset++, new Uint8Array(this._dataView.buffer, this._dataView.byteOffset + n2, i2);
  }
}
const Oi = new Uint8Array([0]), Ti = [171, 75, 84, 88, 32, 50, 48, 187, 13, 10, 26, 10];
function Vi(t2) {
  return "undefined" != typeof TextEncoder ? new TextEncoder().encode(t2) : Buffer.from(t2);
}
function Ei(t2) {
  return "undefined" != typeof TextDecoder ? new TextDecoder().decode(t2) : Buffer.from(t2).toString("utf8");
}
function Fi(t2) {
  let e2 = 0;
  for (const n3 of t2) e2 += n3.byteLength;
  const n2 = new Uint8Array(e2);
  let i2 = 0;
  for (const e3 of t2) n2.set(new Uint8Array(e3), i2), i2 += e3.byteLength;
  return n2;
}
function Pi(t2) {
  const e2 = new Uint8Array(t2.buffer, t2.byteOffset, Ti.length);
  if (e2[0] !== Ti[0] || e2[1] !== Ti[1] || e2[2] !== Ti[2] || e2[3] !== Ti[3] || e2[4] !== Ti[4] || e2[5] !== Ti[5] || e2[6] !== Ti[6] || e2[7] !== Ti[7] || e2[8] !== Ti[8] || e2[9] !== Ti[9] || e2[10] !== Ti[10] || e2[11] !== Ti[11]) throw new Error("Missing KTX 2.0 identifier.");
  const n2 = new Si(), i2 = 17 * Uint32Array.BYTES_PER_ELEMENT, s2 = new Ii(t2, Ti.length, i2, true);
  n2.vkFormat = s2._nextUint32(), n2.typeSize = s2._nextUint32(), n2.pixelWidth = s2._nextUint32(), n2.pixelHeight = s2._nextUint32(), n2.pixelDepth = s2._nextUint32(), n2.layerCount = s2._nextUint32(), n2.faceCount = s2._nextUint32();
  const a2 = s2._nextUint32();
  n2.supercompressionScheme = s2._nextUint32();
  const r2 = s2._nextUint32(), o2 = s2._nextUint32(), l2 = s2._nextUint32(), f2 = s2._nextUint32(), U2 = s2._nextUint64(), c2 = s2._nextUint64(), h2 = new Ii(t2, Ti.length + i2, 3 * a2 * 8, true);
  for (let e3 = 0; e3 < a2; e3++) n2.levels.push({ levelData: new Uint8Array(t2.buffer, t2.byteOffset + h2._nextUint64(), h2._nextUint64()), uncompressedByteLength: h2._nextUint64() });
  const _2 = new Ii(t2, r2, o2, true), p2 = { vendorId: _2._skip(4)._nextUint16(), descriptorType: _2._nextUint16(), versionNumber: _2._nextUint16(), descriptorBlockSize: _2._nextUint16(), colorModel: _2._nextUint8(), colorPrimaries: _2._nextUint8(), transferFunction: _2._nextUint8(), flags: _2._nextUint8(), texelBlockDimension: [_2._nextUint8(), _2._nextUint8(), _2._nextUint8(), _2._nextUint8()], bytesPlane: [_2._nextUint8(), _2._nextUint8(), _2._nextUint8(), _2._nextUint8(), _2._nextUint8(), _2._nextUint8(), _2._nextUint8(), _2._nextUint8()], samples: [] }, g2 = (p2.descriptorBlockSize / 4 - 6) / 4;
  for (let t3 = 0; t3 < g2; t3++) {
    const e3 = { bitOffset: _2._nextUint16(), bitLength: _2._nextUint8(), channelType: _2._nextUint8(), samplePosition: [_2._nextUint8(), _2._nextUint8(), _2._nextUint8(), _2._nextUint8()], sampleLower: -Infinity, sampleUpper: Infinity };
    64 & e3.channelType ? (e3.sampleLower = _2._nextInt32(), e3.sampleUpper = _2._nextInt32()) : (e3.sampleLower = _2._nextUint32(), e3.sampleUpper = _2._nextUint32()), p2.samples[t3] = e3;
  }
  n2.dataFormatDescriptor.length = 0, n2.dataFormatDescriptor.push(p2);
  const y2 = new Ii(t2, l2, f2, true);
  for (; y2._offset < f2; ) {
    const t3 = y2._nextUint32(), e3 = y2._scan(t3), i3 = Ei(e3), s3 = y2._scan(t3 - e3.byteLength);
    n2.keyValue[i3] = i3.match(/^ktx/i) ? Ei(s3) : s3, y2._offset % 4 && y2._skip(4 - y2._offset % 4);
  }
  if (c2 <= 0) return n2;
  const x2 = new Ii(t2, U2, c2, true), u2 = x2._nextUint16(), b2 = x2._nextUint16(), d2 = x2._nextUint32(), m2 = x2._nextUint32(), w2 = x2._nextUint32(), D2 = x2._nextUint32(), B2 = [];
  for (let t3 = 0; t3 < a2; t3++) B2.push({ imageFlags: x2._nextUint32(), rgbSliceByteOffset: x2._nextUint32(), rgbSliceByteLength: x2._nextUint32(), alphaSliceByteOffset: x2._nextUint32(), alphaSliceByteLength: x2._nextUint32() });
  const L2 = U2 + x2._offset, A2 = L2 + d2, k2 = A2 + m2, v2 = k2 + w2, S2 = new Uint8Array(t2.buffer, t2.byteOffset + L2, d2), I2 = new Uint8Array(t2.buffer, t2.byteOffset + A2, m2), O2 = new Uint8Array(t2.buffer, t2.byteOffset + k2, w2), T2 = new Uint8Array(t2.buffer, t2.byteOffset + v2, D2);
  return n2.globalData = { endpointCount: u2, selectorCount: b2, imageDescs: B2, endpointsData: S2, selectorsData: I2, tablesData: O2, extendedData: T2 }, n2;
}
function Ci() {
  return (Ci = Object.assign || function(t2) {
    for (var e2 = 1; e2 < arguments.length; e2++) {
      var n2 = arguments[e2];
      for (var i2 in n2) Object.prototype.hasOwnProperty.call(n2, i2) && (t2[i2] = n2[i2]);
    }
    return t2;
  }).apply(this, arguments);
}
const zi = { keepWriter: false };
function Mi(t2, e2 = {}) {
  e2 = Ci({}, zi, e2);
  let n2 = new ArrayBuffer(0);
  if (t2.globalData) {
    const e3 = new ArrayBuffer(20 + 5 * t2.globalData.imageDescs.length * 4), i3 = new DataView(e3);
    i3.setUint16(0, t2.globalData.endpointCount, true), i3.setUint16(2, t2.globalData.selectorCount, true), i3.setUint32(4, t2.globalData.endpointsData.byteLength, true), i3.setUint32(8, t2.globalData.selectorsData.byteLength, true), i3.setUint32(12, t2.globalData.tablesData.byteLength, true), i3.setUint32(16, t2.globalData.extendedData.byteLength, true);
    for (let e4 = 0; e4 < t2.globalData.imageDescs.length; e4++) {
      const n3 = t2.globalData.imageDescs[e4];
      i3.setUint32(20 + 5 * e4 * 4 + 0, n3.imageFlags, true), i3.setUint32(20 + 5 * e4 * 4 + 4, n3.rgbSliceByteOffset, true), i3.setUint32(20 + 5 * e4 * 4 + 8, n3.rgbSliceByteLength, true), i3.setUint32(20 + 5 * e4 * 4 + 12, n3.alphaSliceByteOffset, true), i3.setUint32(20 + 5 * e4 * 4 + 16, n3.alphaSliceByteLength, true);
    }
    n2 = Fi([e3, t2.globalData.endpointsData, t2.globalData.selectorsData, t2.globalData.tablesData, t2.globalData.extendedData]);
  }
  const i2 = [];
  let s2 = t2.keyValue;
  e2.keepWriter || (s2 = Ci({}, t2.keyValue, { KTXwriter: "KTX-Parse v0.3.1" }));
  for (const t3 in s2) {
    const e3 = s2[t3], n3 = Vi(t3), a3 = "string" == typeof e3 ? Vi(e3) : e3, r3 = n3.byteLength + 1 + a3.byteLength + 1, o3 = r3 % 4 ? 4 - r3 % 4 : 0;
    i2.push(Fi([new Uint32Array([r3]), n3, Oi, a3, Oi, new Uint8Array(o3).fill(0)]));
  }
  const a2 = Fi(i2);
  if (1 !== t2.dataFormatDescriptor.length || 0 !== t2.dataFormatDescriptor[0].descriptorType) throw new Error("Only BASICFORMAT Data Format Descriptor output supported.");
  const r2 = t2.dataFormatDescriptor[0], o2 = new ArrayBuffer(28 + 16 * r2.samples.length), l2 = new DataView(o2), f2 = 24 + 16 * r2.samples.length;
  if (l2.setUint32(0, o2.byteLength, true), l2.setUint16(4, r2.vendorId, true), l2.setUint16(6, r2.descriptorType, true), l2.setUint16(8, r2.versionNumber, true), l2.setUint16(10, f2, true), l2.setUint8(12, r2.colorModel), l2.setUint8(13, r2.colorPrimaries), l2.setUint8(14, r2.transferFunction), l2.setUint8(15, r2.flags), !Array.isArray(r2.texelBlockDimension)) throw new Error("texelBlockDimension is now an array. For dimensionality `d`, set `d - 1`.");
  l2.setUint8(16, r2.texelBlockDimension[0]), l2.setUint8(17, r2.texelBlockDimension[1]), l2.setUint8(18, r2.texelBlockDimension[2]), l2.setUint8(19, r2.texelBlockDimension[3]);
  for (let t3 = 0; t3 < 8; t3++) l2.setUint8(20 + t3, r2.bytesPlane[t3]);
  for (let t3 = 0; t3 < r2.samples.length; t3++) {
    const e3 = r2.samples[t3], n3 = 28 + 16 * t3;
    if (e3.channelID) throw new Error("channelID has been renamed to channelType.");
    l2.setUint16(n3 + 0, e3.bitOffset, true), l2.setUint8(n3 + 2, e3.bitLength), l2.setUint8(n3 + 3, e3.channelType), l2.setUint8(n3 + 4, e3.samplePosition[0]), l2.setUint8(n3 + 5, e3.samplePosition[1]), l2.setUint8(n3 + 6, e3.samplePosition[2]), l2.setUint8(n3 + 7, e3.samplePosition[3]), 64 & e3.channelType ? (l2.setInt32(n3 + 8, e3.sampleLower, true), l2.setInt32(n3 + 12, e3.sampleUpper, true)) : (l2.setUint32(n3 + 8, e3.sampleLower, true), l2.setUint32(n3 + 12, e3.sampleUpper, true));
  }
  const U2 = Ti.length + 68 + 3 * t2.levels.length * 8, c2 = U2 + o2.byteLength;
  let h2 = n2.byteLength > 0 ? c2 + a2.byteLength : 0;
  h2 % 8 && (h2 += 8 - h2 % 8);
  const _2 = [], p2 = new DataView(new ArrayBuffer(3 * t2.levels.length * 8));
  let g2 = (h2 || c2 + a2.byteLength) + n2.byteLength;
  for (let e3 = 0; e3 < t2.levels.length; e3++) {
    const n3 = t2.levels[e3];
    _2.push(n3.levelData), p2.setBigUint64(24 * e3 + 0, BigInt(g2), true), p2.setBigUint64(24 * e3 + 8, BigInt(n3.levelData.byteLength), true), p2.setBigUint64(24 * e3 + 16, BigInt(n3.uncompressedByteLength), true), g2 += n3.levelData.byteLength;
  }
  const y2 = new ArrayBuffer(68), x2 = new DataView(y2);
  return x2.setUint32(0, t2.vkFormat, true), x2.setUint32(4, t2.typeSize, true), x2.setUint32(8, t2.pixelWidth, true), x2.setUint32(12, t2.pixelHeight, true), x2.setUint32(16, t2.pixelDepth, true), x2.setUint32(20, t2.layerCount, true), x2.setUint32(24, t2.faceCount, true), x2.setUint32(28, t2.levels.length, true), x2.setUint32(32, t2.supercompressionScheme, true), x2.setUint32(36, U2, true), x2.setUint32(40, o2.byteLength, true), x2.setUint32(44, c2, true), x2.setUint32(48, a2.byteLength, true), x2.setBigUint64(52, BigInt(n2.byteLength > 0 ? h2 : 0), true), x2.setBigUint64(60, BigInt(n2.byteLength), true), new Uint8Array(Fi([new Uint8Array(Ti).buffer, y2, p2.buffer, o2, a2, h2 > 0 ? new ArrayBuffer(h2 - (c2 + a2.byteLength)) : new ArrayBuffer(0), n2, ..._2]));
}
export { Q as KHR_DF_CHANNEL_RGBSDA_ALPHA, q as KHR_DF_CHANNEL_RGBSDA_BLUE, J as KHR_DF_CHANNEL_RGBSDA_DEPTH, Y as KHR_DF_CHANNEL_RGBSDA_GREEN, R as KHR_DF_CHANNEL_RGBSDA_RED, G as KHR_DF_CHANNEL_RGBSDA_STENCIL, p as KHR_DF_FLAG_ALPHA_PREMULTIPLIED, _ as KHR_DF_FLAG_ALPHA_STRAIGHT, s as KHR_DF_KHR_DESCRIPTORTYPE_BASICFORMAT, c as KHR_DF_MODEL_ASTC, f as KHR_DF_MODEL_ETC1, h as KHR_DF_MODEL_ETC1S, U as KHR_DF_MODEL_ETC2, l as KHR_DF_MODEL_RGBSDA, o as KHR_DF_MODEL_UNSPECIFIED, W as KHR_DF_PRIMARIES_ACES, N as KHR_DF_PRIMARIES_ACESCC, j as KHR_DF_PRIMARIES_ADOBERGB, z as KHR_DF_PRIMARIES_BT2020, P as KHR_DF_PRIMARIES_BT601_EBU, C as KHR_DF_PRIMARIES_BT601_SMPTE, F as KHR_DF_PRIMARIES_BT709, M as KHR_DF_PRIMARIES_CIEXYZ, X as KHR_DF_PRIMARIES_DISPLAYP3, H as KHR_DF_PRIMARIES_NTSC1953, K as KHR_DF_PRIMARIES_PAL525, E as KHR_DF_PRIMARIES_UNSPECIFIED, tt as KHR_DF_SAMPLE_DATATYPE_EXPONENT, Z as KHR_DF_SAMPLE_DATATYPE_FLOAT, et as KHR_DF_SAMPLE_DATATYPE_LINEAR, $ as KHR_DF_SAMPLE_DATATYPE_SIGNED, O as KHR_DF_TRANSFER_ACESCC, T as KHR_DF_TRANSFER_ACESCCT, V as KHR_DF_TRANSFER_ADOBERGB, w as KHR_DF_TRANSFER_BT1886, k as KHR_DF_TRANSFER_DCIP3, B as KHR_DF_TRANSFER_HLG_EOTF, D as KHR_DF_TRANSFER_HLG_OETF, u as KHR_DF_TRANSFER_ITU, y as KHR_DF_TRANSFER_LINEAR, b as KHR_DF_TRANSFER_NTSC, S as KHR_DF_TRANSFER_PAL625_EOTF, v as KHR_DF_TRANSFER_PAL_OETF, L as KHR_DF_TRANSFER_PQ_EOTF, A as KHR_DF_TRANSFER_PQ_OETF, d as KHR_DF_TRANSFER_SLOG, m as KHR_DF_TRANSFER_SLOG2, x as KHR_DF_TRANSFER_SRGB, I as KHR_DF_TRANSFER_ST240, g as KHR_DF_TRANSFER_UNSPECIFIED, a as KHR_DF_VENDORID_KHRONOS, r as KHR_DF_VERSION, e as KHR_SUPERCOMPRESSION_BASISLZ, t as KHR_SUPERCOMPRESSION_NONE, i as KHR_SUPERCOMPRESSION_ZLIB, n as KHR_SUPERCOMPRESSION_ZSTD, Si as KTX2Container, Ut as VK_FORMAT_A1R5G5B5_UNORM_PACK16, qt as VK_FORMAT_A2B10G10R10_SINT_PACK32, Rt as VK_FORMAT_A2B10G10R10_SNORM_PACK32, Yt as VK_FORMAT_A2B10G10R10_UINT_PACK32, jt as VK_FORMAT_A2B10G10R10_UNORM_PACK32, Xt as VK_FORMAT_A2R10G10B10_SINT_PACK32, Ht as VK_FORMAT_A2R10G10B10_SNORM_PACK32, Kt as VK_FORMAT_A2R10G10B10_UINT_PACK32, Nt as VK_FORMAT_A2R10G10B10_UNORM_PACK32, vi as VK_FORMAT_A4B4G4R4_UNORM_PACK16_EXT, ki as VK_FORMAT_A4R4G4B4_UNORM_PACK16_EXT, Bi as VK_FORMAT_ASTC_10x10_SFLOAT_BLOCK_EXT, Xn as VK_FORMAT_ASTC_10x10_SRGB_BLOCK, Kn as VK_FORMAT_ASTC_10x10_UNORM_BLOCK, mi as VK_FORMAT_ASTC_10x5_SFLOAT_BLOCK_EXT, zn as VK_FORMAT_ASTC_10x5_SRGB_BLOCK, Cn as VK_FORMAT_ASTC_10x5_UNORM_BLOCK, wi as VK_FORMAT_ASTC_10x6_SFLOAT_BLOCK_EXT, Wn as VK_FORMAT_ASTC_10x6_SRGB_BLOCK, Mn as VK_FORMAT_ASTC_10x6_UNORM_BLOCK, Di as VK_FORMAT_ASTC_10x8_SFLOAT_BLOCK_EXT, Hn as VK_FORMAT_ASTC_10x8_SRGB_BLOCK, Nn as VK_FORMAT_ASTC_10x8_UNORM_BLOCK, Li as VK_FORMAT_ASTC_12x10_SFLOAT_BLOCK_EXT, Rn as VK_FORMAT_ASTC_12x10_SRGB_BLOCK, jn as VK_FORMAT_ASTC_12x10_UNORM_BLOCK, Ai as VK_FORMAT_ASTC_12x12_SFLOAT_BLOCK_EXT, qn as VK_FORMAT_ASTC_12x12_SRGB_BLOCK, Yn as VK_FORMAT_ASTC_12x12_UNORM_BLOCK, _i as VK_FORMAT_ASTC_4x4_SFLOAT_BLOCK_EXT, wn as VK_FORMAT_ASTC_4x4_SRGB_BLOCK, mn as VK_FORMAT_ASTC_4x4_UNORM_BLOCK, pi as VK_FORMAT_ASTC_5x4_SFLOAT_BLOCK_EXT, Bn as VK_FORMAT_ASTC_5x4_SRGB_BLOCK, Dn as VK_FORMAT_ASTC_5x4_UNORM_BLOCK, gi as VK_FORMAT_ASTC_5x5_SFLOAT_BLOCK_EXT, An as VK_FORMAT_ASTC_5x5_SRGB_BLOCK, Ln as VK_FORMAT_ASTC_5x5_UNORM_BLOCK, yi as VK_FORMAT_ASTC_6x5_SFLOAT_BLOCK_EXT, vn as VK_FORMAT_ASTC_6x5_SRGB_BLOCK, kn as VK_FORMAT_ASTC_6x5_UNORM_BLOCK, xi as VK_FORMAT_ASTC_6x6_SFLOAT_BLOCK_EXT, In as VK_FORMAT_ASTC_6x6_SRGB_BLOCK, Sn as VK_FORMAT_ASTC_6x6_UNORM_BLOCK, ui as VK_FORMAT_ASTC_8x5_SFLOAT_BLOCK_EXT, Tn as VK_FORMAT_ASTC_8x5_SRGB_BLOCK, On as VK_FORMAT_ASTC_8x5_UNORM_BLOCK, bi as VK_FORMAT_ASTC_8x6_SFLOAT_BLOCK_EXT, En as VK_FORMAT_ASTC_8x6_SRGB_BLOCK, Vn as VK_FORMAT_ASTC_8x6_UNORM_BLOCK, di as VK_FORMAT_ASTC_8x8_SFLOAT_BLOCK_EXT, Pn as VK_FORMAT_ASTC_8x8_SRGB_BLOCK, Fn as VK_FORMAT_ASTC_8x8_UNORM_BLOCK, Me as VK_FORMAT_B10G11R11_UFLOAT_PACK32, $n as VK_FORMAT_B10X6G10X6R10X6G10X6_422_UNORM_4PACK16, si as VK_FORMAT_B12X4G12X4R12X4G12X4_422_UNORM_4PACK16, at as VK_FORMAT_B4G4R4A4_UNORM_PACK16, ft as VK_FORMAT_B5G5R5A1_UNORM_PACK16, ot as VK_FORMAT_B5G6R5_UNORM_PACK16, Mt as VK_FORMAT_B8G8R8A8_SINT, Ct as VK_FORMAT_B8G8R8A8_SNORM, Wt as VK_FORMAT_B8G8R8A8_SRGB, zt as VK_FORMAT_B8G8R8A8_UINT, Pt as VK_FORMAT_B8G8R8A8_UNORM, St as VK_FORMAT_B8G8R8_SINT, kt as VK_FORMAT_B8G8R8_SNORM, It as VK_FORMAT_B8G8R8_SRGB, vt as VK_FORMAT_B8G8R8_UINT, At as VK_FORMAT_B8G8R8_UNORM, Qe as VK_FORMAT_BC1_RGBA_SRGB_BLOCK, Je as VK_FORMAT_BC1_RGBA_UNORM_BLOCK, Ge as VK_FORMAT_BC1_RGB_SRGB_BLOCK, qe as VK_FORMAT_BC1_RGB_UNORM_BLOCK, $e as VK_FORMAT_BC2_SRGB_BLOCK, Ze as VK_FORMAT_BC2_UNORM_BLOCK, en as VK_FORMAT_BC3_SRGB_BLOCK, tn as VK_FORMAT_BC3_UNORM_BLOCK, sn as VK_FORMAT_BC4_SNORM_BLOCK, nn as VK_FORMAT_BC4_UNORM_BLOCK, rn as VK_FORMAT_BC5_SNORM_BLOCK, an as VK_FORMAT_BC5_UNORM_BLOCK, ln as VK_FORMAT_BC6H_SFLOAT_BLOCK, on as VK_FORMAT_BC6H_UFLOAT_BLOCK, Un as VK_FORMAT_BC7_SRGB_BLOCK, fn as VK_FORMAT_BC7_UNORM_BLOCK, Ne as VK_FORMAT_D16_UNORM, je as VK_FORMAT_D16_UNORM_S8_UINT, Re as VK_FORMAT_D24_UNORM_S8_UINT, Ke as VK_FORMAT_D32_SFLOAT, Ye as VK_FORMAT_D32_SFLOAT_S8_UINT, We as VK_FORMAT_E5B9G9R9_UFLOAT_PACK32, dn as VK_FORMAT_EAC_R11G11_SNORM_BLOCK, bn as VK_FORMAT_EAC_R11G11_UNORM_BLOCK, un as VK_FORMAT_EAC_R11_SNORM_BLOCK, xn as VK_FORMAT_EAC_R11_UNORM_BLOCK, pn as VK_FORMAT_ETC2_R8G8B8A1_SRGB_BLOCK, _n as VK_FORMAT_ETC2_R8G8B8A1_UNORM_BLOCK, yn as VK_FORMAT_ETC2_R8G8B8A8_SRGB_BLOCK, gn as VK_FORMAT_ETC2_R8G8B8A8_UNORM_BLOCK, hn as VK_FORMAT_ETC2_R8G8B8_SRGB_BLOCK, cn as VK_FORMAT_ETC2_R8G8B8_UNORM_BLOCK, Zn as VK_FORMAT_G10X6B10X6G10X6R10X6_422_UNORM_4PACK16, ii as VK_FORMAT_G12X4B12X4G12X4R12X4_422_UNORM_4PACK16, fi as VK_FORMAT_PVRTC1_2BPP_SRGB_BLOCK_IMG, ai as VK_FORMAT_PVRTC1_2BPP_UNORM_BLOCK_IMG, Ui as VK_FORMAT_PVRTC1_4BPP_SRGB_BLOCK_IMG, ri as VK_FORMAT_PVRTC1_4BPP_UNORM_BLOCK_IMG, ci as VK_FORMAT_PVRTC2_2BPP_SRGB_BLOCK_IMG, oi as VK_FORMAT_PVRTC2_2BPP_UNORM_BLOCK_IMG, hi as VK_FORMAT_PVRTC2_4BPP_SRGB_BLOCK_IMG, li as VK_FORMAT_PVRTC2_4BPP_UNORM_BLOCK_IMG, Qn as VK_FORMAT_R10X6G10X6B10X6A10X6_UNORM_4PACK16, Jn as VK_FORMAT_R10X6G10X6_UNORM_2PACK16, Gn as VK_FORMAT_R10X6_UNORM_PACK16, ni as VK_FORMAT_R12X4G12X4B12X4A12X4_UNORM_4PACK16, ei as VK_FORMAT_R12X4G12X4_UNORM_2PACK16, ti as VK_FORMAT_R12X4_UNORM_PACK16, pe as VK_FORMAT_R16G16B16A16_SFLOAT, _e as VK_FORMAT_R16G16B16A16_SINT, ce as VK_FORMAT_R16G16B16A16_SNORM, he as VK_FORMAT_R16G16B16A16_UINT, Ue as VK_FORMAT_R16G16B16A16_UNORM, fe as VK_FORMAT_R16G16B16_SFLOAT, le as VK_FORMAT_R16G16B16_SINT, re as VK_FORMAT_R16G16B16_SNORM, oe as VK_FORMAT_R16G16B16_UINT, ae as VK_FORMAT_R16G16B16_UNORM, se as VK_FORMAT_R16G16_SFLOAT, ie as VK_FORMAT_R16G16_SINT, ee as VK_FORMAT_R16G16_SNORM, ne as VK_FORMAT_R16G16_UINT, te as VK_FORMAT_R16G16_UNORM, $t as VK_FORMAT_R16_SFLOAT, Zt as VK_FORMAT_R16_SINT, Jt as VK_FORMAT_R16_SNORM, Qt as VK_FORMAT_R16_UINT, Gt as VK_FORMAT_R16_UNORM, Ae as VK_FORMAT_R32G32B32A32_SFLOAT, Le as VK_FORMAT_R32G32B32A32_SINT, Be as VK_FORMAT_R32G32B32A32_UINT, De as VK_FORMAT_R32G32B32_SFLOAT, we as VK_FORMAT_R32G32B32_SINT, me as VK_FORMAT_R32G32B32_UINT, de as VK_FORMAT_R32G32_SFLOAT, be as VK_FORMAT_R32G32_SINT, ue as VK_FORMAT_R32G32_UINT, xe as VK_FORMAT_R32_SFLOAT, ye as VK_FORMAT_R32_SINT, ge as VK_FORMAT_R32_UINT, st as VK_FORMAT_R4G4B4A4_UNORM_PACK16, it as VK_FORMAT_R4G4_UNORM_PACK8, lt as VK_FORMAT_R5G5B5A1_UNORM_PACK16, rt as VK_FORMAT_R5G6B5_UNORM_PACK16, ze as VK_FORMAT_R64G64B64A64_SFLOAT, Ce as VK_FORMAT_R64G64B64A64_SINT, Pe as VK_FORMAT_R64G64B64A64_UINT, Fe as VK_FORMAT_R64G64B64_SFLOAT, Ee as VK_FORMAT_R64G64B64_SINT, Ve as VK_FORMAT_R64G64B64_UINT, Te as VK_FORMAT_R64G64_SFLOAT, Oe as VK_FORMAT_R64G64_SINT, Ie as VK_FORMAT_R64G64_UINT, Se as VK_FORMAT_R64_SFLOAT, ve as VK_FORMAT_R64_SINT, ke as VK_FORMAT_R64_UINT, Et as VK_FORMAT_R8G8B8A8_SINT, Tt as VK_FORMAT_R8G8B8A8_SNORM, Ft as VK_FORMAT_R8G8B8A8_SRGB, Vt as VK_FORMAT_R8G8B8A8_UINT, Ot as VK_FORMAT_R8G8B8A8_UNORM, Bt as VK_FORMAT_R8G8B8_SINT, wt as VK_FORMAT_R8G8B8_SNORM, Lt as VK_FORMAT_R8G8B8_SRGB, Dt as VK_FORMAT_R8G8B8_UINT, mt as VK_FORMAT_R8G8B8_UNORM, bt as VK_FORMAT_R8G8_SINT, xt as VK_FORMAT_R8G8_SNORM, dt as VK_FORMAT_R8G8_SRGB, ut as VK_FORMAT_R8G8_UINT, yt as VK_FORMAT_R8G8_UNORM, pt as VK_FORMAT_R8_SINT, ht as VK_FORMAT_R8_SNORM, gt as VK_FORMAT_R8_SRGB, _t as VK_FORMAT_R8_UINT, ct as VK_FORMAT_R8_UNORM, Xe as VK_FORMAT_S8_UINT, nt as VK_FORMAT_UNDEFINED, He as VK_FORMAT_X8_D24_UNORM_PACK32, Pi as read, Mi as write };
