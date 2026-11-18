function setupWebGLXRFallback(renderer, createFallbackRenderer, onFallback = () => {
}) {
  let currentRenderer = renderer;
  const patchedRenderers = /* @__PURE__ */ new WeakSet();
  function patchRenderer(renderer2) {
    if (patchedRenderers.has(renderer2)) return;
    patchedRenderers.add(renderer2);
    const setSession = renderer2.xr.setSession.bind(renderer2.xr);
    renderer2.xr.setSession = async function(session) {
      if (renderer2 !== currentRenderer) {
        return currentRenderer.xr.setSession(session);
      }
      if (session !== null && renderer2.backend.isWebGPUBackend === true && session.enabledFeatures.includes("webgpu") === false) {
        return switchToFallbackRenderer(session, renderer2);
      }
      try {
        return await setSession(session);
      } catch (error) {
        if (session === null || renderer2.backend.isWebGPUBackend !== true) {
          throw error;
        }
        return switchToFallbackRenderer(session, renderer2);
      }
    };
  }
  async function switchToFallbackRenderer(session, renderer2) {
    if (renderer2.initialized === false) await renderer2.init();
    const fallbackRenderer = createFallbackRenderer(renderer2);
    if (fallbackRenderer.backend.isWebGLBackend !== true) {
      throw new Error("THREE.WebGLXRFallback: createFallbackRenderer() must return a renderer with a WebGL backend.");
    }
    const animationLoop = renderer2.getAnimationLoop();
    fallbackRenderer.xr.enabled = renderer2.xr.enabled;
    fallbackRenderer.xr.cameraAutoUpdate = renderer2.xr.cameraAutoUpdate;
    fallbackRenderer.xr.setFramebufferScaleFactor(renderer2.xr.getFramebufferScaleFactor());
    fallbackRenderer.xr.setReferenceSpaceType(renderer2.xr.getReferenceSpaceType());
    if (animationLoop !== null) await fallbackRenderer.setAnimationLoop(animationLoop);
    await onFallback(fallbackRenderer, renderer2);
    currentRenderer = fallbackRenderer;
    patchRenderer(fallbackRenderer);
    return fallbackRenderer.xr.setSession(session);
  }
  patchRenderer(renderer);
}
export { setupWebGLXRFallback };
