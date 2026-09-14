(function exposeParentHarness(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MagdaPreviewParentHarness = api;
})(typeof window === "undefined" ? undefined : window, function createApi() {
  "use strict";

  const IFRAME_HASH = "#mode=preview&hideExplorerPanel=1";

  function createStartData(distribution, selectedName, isWms, config) {
    const catalogData = {
      name: distribution.title,
      type: "magda-item",
      url: config.baseUrl,
      storageApiUrl: config.storageApiBaseUrl,
      distributionId: distribution.identifier,
      defaultBucket: config.datasetsBucket,
      isEnabled: true,
      zoomOnEnable: true
    };

    if (selectedName) {
      if (isWms) catalogData.selectedWmsLayerName = selectedName;
      else catalogData.selectedWfsFeatureTypeName = selectedName;
    }

    return {
      initSources: [
        {
          catalog: [catalogData],
          baseMapName: "Positron (Light)",
          homeCamera: {
            north: -8,
            east: 158,
            south: -45,
            west: 109
          },
          corsDomains: [new URL(config.baseExternalUrl).hostname]
        }
      ]
    };
  }

  function createMessageHandler(options) {
    const state = {
      loading: true,
      terminal: false,
      error: undefined
    };

    function notify() {
      if (options.onStateChange) options.onStateChange({ ...state });
    }

    function onMessage(event) {
      if (!options.iframeWindow || event.source !== options.iframeWindow) return;

      if (event.data === "ready") {
        options.iframeWindow.postMessage(options.startData, "*");
        state.loading = true;
        state.terminal = false;
        state.error = undefined;
        notify();
        return;
      }

      if (event.data === "loading complete") {
        state.loading = false;
        state.terminal = true;
        state.error = undefined;
        notify();
        return;
      }

      try {
        const data = JSON.parse(event.data);
        if (data && data.type === "error") {
          state.loading = false;
          state.terminal = true;
          state.error = data;
          notify();
        }
      } catch (_error) {
        // DataPreviewMap ignores unrelated non-JSON messages.
      }
    }

    return { state, onMessage };
  }

  return { IFRAME_HASH, createStartData, createMessageHandler };
});
