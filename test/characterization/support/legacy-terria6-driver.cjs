"use strict";

const legacy = require("./load-legacy-magda-catalog-item.cjs");

function captureMessages() {
  const messages = [];
  const parent = {
    postMessage(data, targetOrigin) {
      messages.push({ data, targetOrigin });
    }
  };
  global.window = { parent };
  return messages;
}

function normalizeItem(item) {
  if (!item) return undefined;
  return {
    kind: item.__type,
    url: item.url,
    layers: item.layers,
    typeNames: item.typeNames,
    name: item.name,
    zoomOnEnable: item.zoomOnEnable
  };
}

function nativeGroupItem(item) {
  return legacy.createNativeItem(item.kind, {
    layers: item.layers,
    typeNames: item.typeNames,
    info: []
  });
}

function optionsForDistribution(input) {
  const terria = {
    __groupItems: (input.groupItems || []).map(nativeGroupItem)
  };
  const defaults = new legacy.MagdaCatalogItem(terria);
  const catalogItem = input.catalogItem || {};
  return {
    terria,
    distribution: input.distribution,
    wmsDistributionFormat: defaults.wmsDistributionFormat,
    wfsDistributionFormat: defaults.wfsDistributionFormat,
    esriMapServerDistributionFormat: defaults.esriMapServerDistributionFormat,
    esriFeatureServerDistributionFormat: defaults.esriFeatureServerDistributionFormat,
    kmlDistributionFormat: defaults.kmlDistributionFormat,
    geoJsonDistributionFormat: defaults.geoJsonDistributionFormat,
    czmlDistributionFormat: defaults.czmlDistributionFormat,
    csvDistributionFormat: defaults.csvDistributionFormat,
    allowWmsGroups: true,
    allowWfsGroups: true,
    storageApiUrl: catalogItem.storageApiUrl,
    datasetBucket: catalogItem.datasetBucket || "magda-datasets",
    selectedWmsLayerName: catalogItem.selectedWmsLayerName,
    selectedWfsFeatureTypeName: catalogItem.selectedWfsFeatureTypeName,
    zoomOnEnable: catalogItem.zoomOnEnable
  };
}

async function resolveDistribution(input) {
  const messages = captureMessages();
  try {
    const rawItem = await legacy.MagdaCatalogItem.createCatalogItemFromDistribution(
      optionsForDistribution(input)
    );
    return {
      item: normalizeItem(rawItem),
      messages,
      transitionLoading(value) {
        rawItem.__setIsLoading(value);
      }
    };
  } catch (error) {
    return { error, messages };
  }
}

async function resolveCatalogItem(input) {
  const messages = captureMessages();
  const requests = [];
  legacy.setLoadJson((url) => {
    requests.push(url);
    if (input.registryError) return Promise.reject(input.registryError);
    if (typeof input.registryResponse === "function") {
      return Promise.resolve(input.registryResponse(url));
    }
    return Promise.resolve(input.registryResponse);
  });

  const terria = {
    __groupItems: (input.groupItems || []).map(nativeGroupItem)
  };
  const rawCatalogItem = new legacy.MagdaCatalogItem(terria);
  const { type: _externalType, ...catalogTraits } = input.catalogItem;
  Object.assign(
    rawCatalogItem,
    Object.fromEntries(
      Object.entries(catalogTraits).filter(([, value]) => value !== undefined)
    )
  );

  try {
    const rawItem = await rawCatalogItem._load();
    return {
      item: normalizeItem(rawItem),
      messages,
      requests,
      transitionLoading(value) {
        rawItem.__setIsLoading(value);
      }
    };
  } catch (error) {
    return { error, messages, requests };
  }
}

module.exports = {
  id: "legacy-terria6",
  resolveCatalogItem,
  resolveDistribution,
  rewriteStorageApiUrl({ resourceUrl, bucket, storageApiUrl }) {
    return legacy.MagdaCatalogItem.getStorageApiResourceAccessUrl(
      resourceUrl,
      bucket,
      storageApiUrl
    );
  }
};
