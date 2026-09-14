"use strict";

const fs = require("node:fs");
const path = require("node:path");
const swc = require("@swc/core");

const source = fs.readFileSync(
  path.resolve(__dirname, "../../../lib/Models/magdaPreviewCompatibility.ts"),
  "utf8"
);
const { code } = swc.transformSync(source, {
  filename: "magdaPreviewCompatibility.ts",
  jsc: { parser: { syntax: "typescript" }, target: "es2022" },
  module: { type: "commonjs" }
});
const compiled = { exports: {} };
Function("module", "exports", "require", code)(
  compiled,
  compiled.exports,
  require
);
const compatibility = compiled.exports;

function captureMessages() {
  return [];
}

function postError(messages, error) {
  messages.push({
    data: JSON.stringify({
      type: "error",
      title: error.title || "",
      message: error.message || String(error)
    }),
    targetOrigin: "*"
  });
}

function normalizedItem(definition, catalogItem) {
  return {
    kind: definition.type,
    url: definition.url,
    layers: definition.layers,
    typeNames: definition.typeNames,
    name: definition.name,
    zoomOnEnable: catalogItem.zoomOnEnable
  };
}

function withFallback(definition, groupItems = []) {
  if (!definition) return undefined;
  if (definition.type === "wms" && !definition.layers && groupItems.length) {
    return { ...definition, layers: groupItems[0].layers };
  }
  if (definition.type === "wfs" && !definition.typeNames && groupItems.length) {
    return { ...definition, typeNames: groupItems[0].typeNames };
  }
  return definition;
}

function successfulResult(definition, catalogItem, messages) {
  const item = normalizedItem(definition, catalogItem);
  return {
    item,
    messages,
    transitionLoading(value) {
      if (value === false) {
        messages.push({ data: "loading complete", targetOrigin: "*" });
      }
    }
  };
}

async function resolveDistribution(input) {
  const messages = captureMessages();
  try {
    const definition = withFallback(
      compatibility.definitionFromDistribution(
        input.distribution,
        input.catalogItem
      ),
      input.groupItems
    );
    if (!definition) {
      const error = new Error(
        "The selected Magda record has no compatible distributions."
      );
      error.title = "No compatible distributions found";
      throw error;
    }
    return successfulResult(definition, input.catalogItem, messages);
  } catch (error) {
    postError(messages, error);
    return { error, messages };
  }
}

async function resolveCatalogItem(input) {
  const messages = captureMessages();
  const requests = [];
  try {
    const request = compatibility.buildRegistryRecordUrl(input.catalogItem);
    requests.push(request);
    if (input.registryError) throw input.registryError;
    const record =
      typeof input.registryResponse === "function"
        ? await input.registryResponse(request)
        : input.registryResponse;
    const definition = withFallback(
      compatibility.findCompatibleDefinition(record, input.catalogItem),
      input.groupItems
    );
    if (!definition) {
      const error = new Error(
        "The selected Magda record has no compatible distributions."
      );
      error.title = "No compatible distributions found";
      throw error;
    }
    return {
      ...successfulResult(definition, input.catalogItem, messages),
      requests
    };
  } catch (error) {
    postError(messages, error);
    return { error, messages, requests };
  }
}

module.exports = {
  id: "terria8-adapter",
  resolveCatalogItem,
  resolveDistribution,
  rewriteStorageApiUrl({ resourceUrl, bucket, storageApiUrl }) {
    return compatibility.rewriteStorageApiUrl(
      resourceUrl,
      storageApiUrl,
      bucket
    );
  }
};
