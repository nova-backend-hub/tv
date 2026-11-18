import {
  FileLoader,
  Loader,
  LoaderUtils
} from "three";
import { unzipSync } from "../libs/fflate.module.js";
import { USDAParser } from "./usd/USDAParser.js";
import { USDCParser } from "./usd/USDCParser.js";
import { USDComposer } from "./usd/USDComposer.js";
class USDLoader extends Loader {
  /**
   * Constructs a new USDZ loader.
   *
   * @param {LoadingManager} [manager] - The loading manager.
   */
  constructor(manager) {
    super(manager);
  }
  /**
   * Starts loading from the given URL and passes the loaded USDZ asset
   * to the `onLoad()` callback.
   *
   * @param {string} url - The path/URL of the file to be loaded. This can also be a data URI.
   * @param {function(Group)} onLoad - Executed when the loading process has been finished.
   * @param {onProgressCallback} onProgress - Executed while the loading is in progress.
   * @param {onErrorCallback} onError - Executed when errors occur.
   */
  load(url, onLoad, onProgress, onError) {
    const scope = this;
    const path = scope.path === "" ? LoaderUtils.extractUrlBase(url) : scope.path;
    const loader = new FileLoader(scope.manager);
    loader.setPath(scope.path);
    loader.setResponseType("arraybuffer");
    loader.setRequestHeader(scope.requestHeader);
    loader.setWithCredentials(scope.withCredentials);
    loader.load(url, function(text) {
      try {
        scope.parse(text, path, onLoad, onError);
      } catch (e) {
        if (onError) {
          onError(e);
        } else {
          console.error(e);
        }
        scope.manager.itemError(url);
      }
    }, onProgress, onError);
  }
  /**
   * Parses the given USDZ data and returns the resulting group.
   *
   * The returned group is created synchronously, but any referenced textures
   * are loaded asynchronously. Provide `onLoad` to be notified once all
   * textures have finished loading.
   *
   * @param {ArrayBuffer|string} buffer - The raw USDZ data as an array buffer.
   * @param {string} [path=''] - The URL base path.
   * @param {function(Group)} [onLoad] - Executed once the group and all of its textures are ready.
   * @param {onErrorCallback} [onError] - Executed when errors occur.
   * @return {Group} The parsed asset as a group.
   */
  parse(buffer, path = "", onLoad, onError) {
    const usda = new USDAParser();
    const usdc = new USDCParser();
    const textDecoder = new TextDecoder();
    function toArrayBuffer(data2) {
      if (data2 instanceof ArrayBuffer) return data2;
      if (data2.byteOffset === 0 && data2.byteLength === data2.buffer.byteLength) {
        return data2.buffer;
      }
      return data2.buffer.slice(data2.byteOffset, data2.byteOffset + data2.byteLength);
    }
    function getLowercaseExtension(filename) {
      const lastDot = filename.lastIndexOf(".");
      if (lastDot < 0) return "";
      const lastSlash = filename.lastIndexOf("/");
      if (lastSlash > lastDot) return "";
      return filename.slice(lastDot + 1).toLowerCase();
    }
    function parseAssets(zip) {
      const data2 = {};
      for (const filename in zip) {
        const fileBytes = zip[filename];
        const ext = getLowercaseExtension(filename);
        if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "avif") {
          data2[filename] = fileBytes;
          continue;
        }
        if (ext !== "usd" && ext !== "usda" && ext !== "usdc") continue;
        if (isCrateFile(fileBytes)) {
          data2[filename] = usdc.parseData(toArrayBuffer(fileBytes));
        } else {
          data2[filename] = usda.parseData(textDecoder.decode(fileBytes));
        }
      }
      return data2;
    }
    function isCrateFile(buffer2) {
      const crateHeader = new Uint8Array([80, 88, 82, 45, 85, 83, 68, 67]);
      const view = buffer2 instanceof Uint8Array ? buffer2 : new Uint8Array(buffer2);
      if (view.byteLength < crateHeader.length) return false;
      for (let i = 0; i < crateHeader.length; i++) {
        if (view[i] !== crateHeader[i]) return false;
      }
      return true;
    }
    function findUSD(zip) {
      const fileNames = Object.keys(zip);
      if (fileNames.length < 1) return { file: void 0, filename: "", basePath: "" };
      const firstFileName = fileNames[0];
      const ext = getLowercaseExtension(firstFileName);
      let isCrate = false;
      const lastSlash = firstFileName.lastIndexOf("/");
      const basePath = lastSlash >= 0 ? firstFileName.slice(0, lastSlash) : "";
      if (ext === "usda") return { file: zip[firstFileName], filename: firstFileName, basePath };
      if (ext === "usdc") {
        isCrate = true;
      } else if (ext === "usd") {
        if (!isCrateFile(zip[firstFileName])) {
          return { file: zip[firstFileName], filename: firstFileName, basePath };
        } else {
          isCrate = true;
        }
      }
      if (isCrate) {
        return { file: zip[firstFileName], filename: firstFileName, basePath };
      }
      return { file: void 0, filename: "", basePath: "" };
    }
    const scope = this;
    const finalize = (composer2, group) => {
      if (onLoad) {
        Promise.all(composer2.texturePromises).then(() => onLoad(group)).catch((err) => onError ? onError(err) : console.error(err));
      }
      return group;
    };
    if (typeof buffer === "string") {
      const composer2 = new USDComposer(scope.manager);
      const data2 = usda.parseData(buffer);
      return finalize(composer2, composer2.compose(data2, {}, {}, path));
    }
    if (isCrateFile(buffer)) {
      const composer2 = new USDComposer(scope.manager);
      const data2 = usdc.parseData(toArrayBuffer(buffer));
      return finalize(composer2, composer2.compose(data2, {}, {}, path));
    }
    const bytes = new Uint8Array(buffer);
    if (bytes[0] === 80 && bytes[1] === 75) {
      const zip = unzipSync(bytes);
      const assets = parseAssets(zip);
      const { file, filename, basePath } = findUSD(zip);
      if (!file) {
        throw new Error("THREE.USDLoader: Invalid USDZ package. The first ZIP entry must be a USD layer (.usd/.usda/.usdc).");
      }
      const composer2 = new USDComposer(scope.manager);
      const data2 = assets[filename];
      if (!data2) {
        throw new Error('THREE.USDLoader: Failed to parse root layer "' + filename + '".');
      }
      return finalize(composer2, composer2.compose(data2, assets, {}, basePath));
    }
    const composer = new USDComposer(scope.manager);
    const text = textDecoder.decode(bytes);
    const data = usda.parseData(text);
    return finalize(composer, composer.compose(data, {}, {}, path));
  }
}
export { USDLoader };
