import { Color } from "three";
class DRACOExporter {
  parse(object, options = {}) {
    options = Object.assign({
      decodeSpeed: 5,
      encodeSpeed: 5,
      encoderMethod: DRACOExporter.MESH_EDGEBREAKER_ENCODING,
      quantization: [16, 8, 8, 8, 8],
      exportUvs: true,
      exportNormals: true,
      exportColor: false
    }, options);
    if (DracoEncoderModule === void 0) {
      throw new Error("THREE.DRACOExporter: required the draco_encoder to work.");
    }
    const geometry = object.geometry;
    const dracoEncoder = DracoEncoderModule();
    const encoder = new dracoEncoder.Encoder();
    let builder;
    let dracoObject;
    if (object.isMesh === true) {
      builder = new dracoEncoder.MeshBuilder();
      dracoObject = new dracoEncoder.Mesh();
      const vertices = geometry.getAttribute("position");
      builder.AddFloatAttributeToMesh(dracoObject, dracoEncoder.POSITION, vertices.count, vertices.itemSize, vertices.array);
      const faces = geometry.getIndex();
      if (faces !== null) {
        builder.AddFacesToMesh(dracoObject, faces.count / 3, faces.array);
      } else {
        const faces2 = new (vertices.count > 65535 ? Uint32Array : Uint16Array)(vertices.count);
        for (let i = 0; i < faces2.length; i++) {
          faces2[i] = i;
        }
        builder.AddFacesToMesh(dracoObject, vertices.count, faces2);
      }
      if (options.exportNormals === true) {
        const normals = geometry.getAttribute("normal");
        if (normals !== void 0) {
          builder.AddFloatAttributeToMesh(dracoObject, dracoEncoder.NORMAL, normals.count, normals.itemSize, normals.array);
        }
      }
      if (options.exportUvs === true) {
        const uvs = geometry.getAttribute("uv");
        if (uvs !== void 0) {
          builder.AddFloatAttributeToMesh(dracoObject, dracoEncoder.TEX_COORD, uvs.count, uvs.itemSize, uvs.array);
        }
      }
      if (options.exportColor === true) {
        const colors = geometry.getAttribute("color");
        if (colors !== void 0) {
          const array = createVertexColorSRGBArray(colors);
          builder.AddFloatAttributeToMesh(dracoObject, dracoEncoder.COLOR, colors.count, colors.itemSize, array);
        }
      }
    } else if (object.isPoints === true) {
      builder = new dracoEncoder.PointCloudBuilder();
      dracoObject = new dracoEncoder.PointCloud();
      const vertices = geometry.getAttribute("position");
      builder.AddFloatAttribute(dracoObject, dracoEncoder.POSITION, vertices.count, vertices.itemSize, vertices.array);
      if (options.exportColor === true) {
        const colors = geometry.getAttribute("color");
        if (colors !== void 0) {
          const array = createVertexColorSRGBArray(colors);
          builder.AddFloatAttribute(dracoObject, dracoEncoder.COLOR, colors.count, colors.itemSize, array);
        }
      }
    } else {
      throw new Error("DRACOExporter: Unsupported object type.");
    }
    const encodedData = new dracoEncoder.DracoInt8Array();
    const encodeSpeed = options.encodeSpeed !== void 0 ? options.encodeSpeed : 5;
    const decodeSpeed = options.decodeSpeed !== void 0 ? options.decodeSpeed : 5;
    encoder.SetSpeedOptions(encodeSpeed, decodeSpeed);
    if (options.encoderMethod !== void 0) {
      encoder.SetEncodingMethod(options.encoderMethod);
    }
    if (options.quantization !== void 0) {
      for (let i = 0; i < 5; i++) {
        if (options.quantization[i] !== void 0) {
          encoder.SetAttributeQuantization(i, options.quantization[i]);
        }
      }
    }
    let length;
    if (object.isMesh === true) {
      length = encoder.EncodeMeshToDracoBuffer(dracoObject, encodedData);
    } else {
      length = encoder.EncodePointCloudToDracoBuffer(dracoObject, true, encodedData);
    }
    dracoEncoder.destroy(dracoObject);
    if (length === 0) {
      throw new Error("THREE.DRACOExporter: Draco encoding failed.");
    }
    const outputData = new Int8Array(new ArrayBuffer(length));
    for (let i = 0; i < length; i++) {
      outputData[i] = encodedData.GetValue(i);
    }
    dracoEncoder.destroy(encodedData);
    dracoEncoder.destroy(encoder);
    dracoEncoder.destroy(builder);
    return outputData;
  }
}
function createVertexColorSRGBArray(attribute) {
  const _color = new Color();
  const count = attribute.count;
  const itemSize = attribute.itemSize;
  const array = new Float32Array(count * itemSize);
  for (let i = 0, il = count; i < il; i++) {
    _color.fromBufferAttribute(attribute, i).convertLinearToSRGB();
    array[i * itemSize] = _color.r;
    array[i * itemSize + 1] = _color.g;
    array[i * itemSize + 2] = _color.b;
    if (itemSize === 4) {
      array[i * itemSize + 3] = attribute.getW(i);
    }
  }
  return array;
}
DRACOExporter.MESH_EDGEBREAKER_ENCODING = 1;
DRACOExporter.MESH_SEQUENTIAL_ENCODING = 0;
DRACOExporter.POINT_CLOUD = 0;
DRACOExporter.TRIANGULAR_MESH = 1;
DRACOExporter.INVALID = -1;
DRACOExporter.POSITION = 0;
DRACOExporter.NORMAL = 1;
DRACOExporter.COLOR = 2;
DRACOExporter.TEX_COORD = 3;
DRACOExporter.GENERIC = 4;
export { DRACOExporter };
