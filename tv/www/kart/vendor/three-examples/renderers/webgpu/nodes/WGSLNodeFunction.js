import NodeFunction from "../../../nodes/core/NodeFunction.js";
import NodeFunctionInput from "../../../nodes/core/NodeFunctionInput.js";
const declarationRegexp = /^[fn]*\s*([a-z_0-9]+)?\s*\(([\s\S]*?)\)\s*[\-\>]*\s*([a-z_0-9]+)?/i;
const propertiesRegexp = /[a-z_0-9]+|<(.*?)>+/ig;
const wgslTypeLib = {
  f32: "float"
};
const parse = (source) => {
  source = source.trim();
  const declaration = source.match(declarationRegexp);
  if (declaration !== null && declaration.length === 4) {
    const inputsCode = declaration[2];
    const propsMatches = [];
    let nameMatch = null;
    while ((nameMatch = propertiesRegexp.exec(inputsCode)) !== null) {
      propsMatches.push(nameMatch);
    }
    const inputs = [];
    let i = 0;
    while (i < propsMatches.length) {
      const name2 = propsMatches[i++][0];
      let type2 = propsMatches[i++][0];
      type2 = wgslTypeLib[type2] || type2;
      if (i < propsMatches.length && propsMatches[i][0].startsWith("<") === true)
        i++;
      inputs.push(new NodeFunctionInput(type2, name2));
    }
    const blockCode = source.substring(declaration[0].length);
    const name = declaration[1] !== void 0 ? declaration[1] : "";
    const type = declaration[3] || "void";
    return {
      type,
      inputs,
      name,
      inputsCode,
      blockCode
    };
  } else {
    throw new Error("FunctionNode: Function is not a WGSL code.");
  }
};
class WGSLNodeFunction extends NodeFunction {
  constructor(source) {
    const { type, inputs, name, inputsCode, blockCode } = parse(source);
    super(type, inputs, name);
    this.inputsCode = inputsCode;
    this.blockCode = blockCode;
  }
  getCode(name = this.name) {
    const type = this.type !== "void" ? "-> " + this.type : "";
    return `fn ${name} ( ${this.inputsCode.trim()} ) ${type}` + this.blockCode;
  }
}
export default WGSLNodeFunction;
