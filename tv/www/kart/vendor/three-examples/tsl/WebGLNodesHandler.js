import {
  GLSL3,
  UniformsGroup,
  Compatibility,
  Color,
  UniformsLib,
  UniformsUtils
} from "three";
import {
  context,
  cubeTexture,
  reference,
  texture,
  fog,
  rangeFogFactor,
  densityFogFactor,
  workingToColorSpace
} from "three/tsl";
import {
  NodeUtils,
  NodeFrame,
  Lighting,
  InspectorBase,
  GLSLNodeBuilder,
  BasicNodeLibrary,
  WebGLCapabilities
} from "three/webgpu";
function getObjectHash(object) {
  return "" + object.receiveShadow;
}
function generateUniformsList(program, uniforms) {
  const progUniforms = program.getUniforms();
  const uniformsList = [];
  for (let i = 0; i < progUniforms.seq.length; i++) {
    const u = progUniforms.seq[i];
    if (u.id in uniforms) uniformsList.push(u);
  }
  return uniformsList;
}
class WebGLNodeBuilder extends GLSLNodeBuilder {
  addNode(node) {
    if (node.isShadowNode) {
      node.setupRenderTarget = (shadow) => {
        return { shadowMap: shadow.map, depthTexture: shadow.map.depthTexture };
      };
      node.updateBefore = () => {
      };
    }
    super.addNode(node);
  }
}
class SceneContext {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.lightsNode = renderer.lighting.getNode(scene);
    this.fogNode = null;
    this.environmentNode = null;
    this.prevFog = null;
    this.prevEnvironment = null;
  }
  getCacheKey() {
    const { lightsNode, environmentNode, fogNode } = this;
    const lightsHash = lightsNode.getCacheKey();
    const envHash = environmentNode ? environmentNode.getCacheKey : 0;
    const fogHash = fogNode ? fogNode.getCacheKey() : 0;
    return NodeUtils.hashArray([lightsHash, envHash, fogHash]);
  }
  update() {
    const { scene, lightsNode } = this;
    const sceneLights = [];
    scene.traverse((object) => {
      if (object.isLight) {
        sceneLights.push(object);
      }
    });
    lightsNode.setLights(sceneLights);
    if (this.prevFog !== scene.fog) {
      this.fogNode = this.getFogNode();
      this.prevFog = scene.fog;
    }
    if (this.prevEnvironment !== scene.environment) {
      this.environmentNode = this.getEnvironmentNode();
      this.prevEnvironment = scene.environment;
    }
  }
  getFogNode() {
    const { scene } = this;
    if (scene.fog && scene.fog.isFogExp2) {
      const color = reference("color", "color", scene.fog);
      const density = reference("density", "float", scene.fog);
      return fog(color, densityFogFactor(density));
    } else if (scene.fog && scene.fog.isFog) {
      const color = reference("color", "color", scene.fog);
      const near = reference("near", "float", scene.fog);
      const far = reference("far", "float", scene.fog);
      return fog(color, rangeFogFactor(near, far));
    } else {
      return null;
    }
  }
  getEnvironmentNode() {
    const { scene } = this;
    if (scene.environment && scene.environment.isCubeTexture) {
      return cubeTexture(scene.environment);
    } else if (scene.environment && scene.environment.isTexture) {
      return texture(scene.environment);
    } else {
      return null;
    }
  }
}
class RendererProxy {
  constructor(renderer) {
    const backend = {
      isWebGPUBackend: false,
      extensions: renderer.extensions,
      gl: renderer.getContext(),
      capabilities: null
    };
    backend.capabilities = new WebGLCapabilities(backend);
    this.contextNode = context();
    this.inspector = new InspectorBase();
    this.library = new BasicNodeLibrary();
    this.lighting = new Lighting();
    this.backend = backend;
    const self = this;
    return new Proxy(renderer, {
      get(target, property) {
        return Reflect.get(property in self ? self : target, property);
      },
      set(target, property, value) {
        return Reflect.set(property in self ? self : target, property, value);
      }
    });
  }
  hasInitialized() {
    return true;
  }
  getMRT() {
    return null;
  }
  hasCompatibility(name) {
    if (name === Compatibility.TEXTURE_COMPARE) {
      return true;
    }
    return false;
  }
  getCacheKey() {
    return this.toneMapping + this.outputColorSpace;
  }
}
export class WebGLNodesHandler {
  /**
   * Constructs a new WebGL node adapter.
   */
  constructor() {
    this.renderer = null;
    this.nodeFrame = new NodeFrame();
    this.sceneContexts = /* @__PURE__ */ new WeakMap();
    this.programCache = /* @__PURE__ */ new Map();
    this.renderStack = [];
    const self = this;
    this.onDisposeMaterialCallback = function() {
      const { programCache } = self;
      if (programCache.has(this)) {
        self.programCache.get(this).forEach(({ uniformsGroups }) => {
          uniformsGroups.forEach((u) => u.dispose());
        });
        self.programCache.delete(this);
      }
      this.removeEventListener("dispose", self.onDisposeMaterialCallback);
    };
    this.getOutputCallback = function(outputNode) {
      const { outputColorSpace, toneMapping } = self.renderer;
      outputNode = outputNode.toneMapping(toneMapping);
      outputNode = workingToColorSpace(outputNode, outputColorSpace);
      return outputNode;
    };
    this.onBeforeRenderCallback = function(renderer, scene, camera, geometry, object) {
      const { nodeFrame } = self;
      nodeFrame.material = this;
      nodeFrame.object = object;
      renderer.info.render.frame++;
      if (renderer.properties.has(this)) {
        const currentProgram = renderer.properties.get(this).currentProgram;
        const programs = self.programCache.get(this);
        if (programs && programs.has(currentProgram)) {
          const { updateNodes } = programs.get(currentProgram);
          self.updateNodes(updateNodes);
        }
      }
      const objectHash = getObjectHash(object);
      if (this.prevObjectHash !== objectHash) {
        this.prevObjectHash = objectHash;
        this.needsUpdate = true;
      }
    };
    this.customProgramCacheKeyCallback = function() {
      const { renderStack, renderer, nodeFrame } = self;
      const sceneHash = renderStack[renderStack.length - 1].sceneContext.getCacheKey();
      const materialHash = this.constructor.prototype.customProgramCacheKey.call(this);
      const rendererHash = renderer.getCacheKey();
      return materialHash + sceneHash + rendererHash + getObjectHash(nodeFrame.object);
    };
  }
  setRenderer(renderer) {
    const rendererProxy = new RendererProxy(renderer);
    this.nodeFrame.renderer = rendererProxy;
    this.renderer = rendererProxy;
  }
  onUpdateProgram(material, program, materialProperties) {
    const { programCache } = this;
    if (!programCache.has(material)) {
      programCache.set(material, /* @__PURE__ */ new Map());
    }
    const programs = programCache.get(material);
    if (!programs.has(program)) {
      const builder = material._latestBuilder;
      const uniforms2 = materialProperties.uniforms;
      programs.set(program, {
        uniformsGroups: this.collectUniformsGroups(builder),
        uniforms: uniforms2,
        uniformsList: generateUniformsList(program, uniforms2),
        updateNodes: builder.updateNodes
      });
    }
    const { uniformsGroups, uniforms, uniformsList, updateNodes } = programs.get(program);
    material.uniformsGroups = uniformsGroups;
    materialProperties.uniforms = uniforms;
    materialProperties.uniformsList = uniformsList;
    this.updateNodes(updateNodes);
  }
  renderStart(scene, camera) {
    const { nodeFrame, renderStack, renderer, sceneContexts } = this;
    nodeFrame.update();
    nodeFrame.camera = camera;
    nodeFrame.scene = scene;
    nodeFrame.frameId++;
    let sceneContext = sceneContexts.get(scene);
    if (!sceneContext) {
      sceneContext = new SceneContext(renderer, scene);
      sceneContexts.set(scene, sceneContext);
    }
    sceneContext.update();
    renderStack.push({ sceneContext, camera });
    const {
      customProgramCacheKeyCallback,
      onBeforeRenderCallback
    } = this;
    scene.traverse((object) => {
      if (object.material && object.material.isNodeMaterial) {
        object.material.customProgramCacheKey = customProgramCacheKeyCallback;
        object.material.onBeforeRender = onBeforeRenderCallback;
      }
    });
  }
  renderEnd() {
    const { nodeFrame, renderStack } = this;
    renderStack.pop();
    const frame = renderStack[renderStack.length - 1];
    if (frame) {
      const { camera, sceneContext } = frame;
      nodeFrame.camera = camera;
      nodeFrame.scene = sceneContext.scene;
    }
  }
  build(material, object, parameters) {
    const {
      nodeFrame,
      renderer,
      getOutputCallback,
      onDisposeMaterialCallback,
      renderStack
    } = this;
    const {
      camera,
      sceneContext
    } = renderStack[renderStack.length - 1];
    const {
      fogNode,
      environmentNode,
      lightsNode,
      scene
    } = sceneContext;
    nodeFrame.material = material;
    nodeFrame.object = object;
    const builder = new WebGLNodeBuilder(object, renderer);
    builder.scene = scene;
    builder.camera = camera;
    builder.material = material;
    builder.fogNode = fogNode;
    builder.environmentNode = environmentNode;
    builder.lightsNode = lightsNode;
    builder.context.getOutput = getOutputCallback;
    builder.build();
    this.updateShaderParameters(builder, parameters);
    this.updateGeometryAttributes(builder, object.geometry);
    nodeFrame.material = material;
    nodeFrame.object = object;
    material._latestBuilder = builder;
    material.addEventListener("dispose", onDisposeMaterialCallback);
    this.updateNodes(builder.updateNodes);
  }
  updateGeometryAttributes(builder, geometry) {
    builder.bufferAttributes.forEach((v) => {
      geometry.setAttribute(v.name, v.node.attribute);
    });
    queueMicrotask(() => geometry.dispose());
  }
  updateShaderParameters(builder, parameters) {
    parameters.isRawShaderMaterial = true;
    parameters.glslVersion = GLSL3;
    parameters.vertexShader = builder.vertexShader.replace(/#version 300 es/, "");
    parameters.fragmentShader = builder.fragmentShader.replace(/#version 300 es/, "");
    parameters.uniforms = {
      fogColor: { value: new Color() },
      fogNear: { value: 0 },
      fogFar: { value: 0 },
      envMapIntensity: { value: 0 },
      ...UniformsUtils.clone(UniformsLib.lights)
    };
    const builderUniforms = [...builder.uniforms.vertex, ...builder.uniforms.fragment];
    for (const uniform of builderUniforms) {
      parameters.uniforms[uniform.name] = uniform.node;
    }
  }
  collectUniformsGroups(builder) {
    const uniformsGroups = [];
    for (const key in builder.uniformGroups) {
      const { uniforms } = builder.uniformGroups[key];
      const group = new UniformsGroup();
      group.name = key;
      group.uniforms = uniforms.map((node) => node.nodeUniform);
      uniformsGroups.push(group);
    }
    const builderUniforms = [...builder.uniforms.vertex, ...builder.uniforms.fragment];
    for (const uniform of builderUniforms) {
      if (uniform.type === "buffer") {
        const group = new UniformsGroup();
        group.name = uniform.node.name;
        group.uniforms = [uniform];
        uniformsGroups.push(group);
      }
    }
    return uniformsGroups;
  }
  updateNodes(updateNodes) {
    const { nodeFrame } = this;
    nodeFrame.renderId++;
    for (const node of updateNodes) {
      nodeFrame.updateNode(node);
    }
  }
}
