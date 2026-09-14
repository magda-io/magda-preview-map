"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const fixture = require("./fixtures/magda-preview-contract.json");
const {
  IFRAME_HASH,
  createMessageHandler,
  createStartData
} = require("./harness/parent-harness.js");
const subject = require("./support/subject.cjs");

function distribution(format, url, extraAspects = {}) {
  return {
    id: "dist-id",
    aspects: {
      "dcat-distribution-strings": {
        title: `Fixture ${format}`,
        description: `Characterization fixture for ${format}`,
        format,
        downloadURL: url
      },
      ...extraAspects
    }
  };
}

function catalogItem(overrides = {}) {
  return {
    name: "Characterization fixture",
    type: "magda-item",
    url: "https://catalog.example.test/",
    storageApiUrl: fixture.storage.storageApiUrl,
    distributionId: "dist-id",
    isEnabled: true,
    zoomOnEnable: true,
    ...overrides
  };
}

async function resolveStorageFixture(bucketFields) {
  return subject.resolveCatalogItem({
    catalogItem: catalogItem(bucketFields),
    registryResponse: distribution("GeoJSON", fixture.storage.pseudoUrl)
  });
}

test("fixture matches the start-data shape emitted by DataPreviewMap", () => {
  const { caller } = fixture;
  const actual = createStartData(
    caller.distribution,
    caller.selection.name,
    caller.selection.isWms,
    caller.config
  );

  assert.equal(IFRAME_HASH, caller.iframeHash);
  assert.deepEqual(actual, caller.startData);
  assert.equal(actual.initSources[0].catalog[0].type, "magda-item");
  assert.equal(actual.initSources[0].catalog[0].defaultBucket, "magda-datasets");
  assert.equal(actual.initSources[0].catalog[0].isEnabled, true);
  assert.equal(actual.initSources[0].catalog[0].zoomOnEnable, true);
  assert.equal(actual.initSources[0].baseMapName, "Positron (Light)");
});

test("caller emits mutually exclusive WMS/WFS selection fields and omits empty selection", () => {
  const { caller } = fixture;
  const wms = createStartData(
    caller.distribution,
    "workspace:wms-layer",
    true,
    caller.config
  ).initSources[0].catalog[0];
  const wfs = createStartData(
    caller.distribution,
    "workspace:wfs-type",
    false,
    caller.config
  ).initSources[0].catalog[0];
  const none = createStartData(
    caller.distribution,
    "",
    false,
    caller.config
  ).initSources[0].catalog[0];

  assert.equal(wms.selectedWmsLayerName, "workspace:wms-layer");
  assert.equal("selectedWfsFeatureTypeName" in wms, false);
  assert.equal(wfs.selectedWfsFeatureTypeName, "workspace:wfs-type");
  assert.equal("selectedWmsLayerName" in wfs, false);
  assert.equal("selectedWmsLayerName" in none, false);
  assert.equal("selectedWfsFeatureTypeName" in none, false);
});

test("distributionId lookup requests Registry aspects and applies dataset-format override", async () => {
  const result = await subject.resolveCatalogItem({
    catalogItem: catalogItem(),
    registryResponse: distribution(
      "application/pdf",
      "https://files.example.test/data.bin",
      { "dataset-format": { format: "GeoJSON" } }
    )
  });
  const requestedUrl = new URL(result.requests[0]);

  assert.equal(result.error, undefined);
  assert.equal(requestedUrl.pathname, fixture.registry.distributionPath);
  assert.equal(requestedUrl.searchParams.get("aspect"), fixture.registry.requiredAspect);
  assert.equal(
    requestedUrl.searchParams.get("optionalAspect"),
    fixture.registry.optionalAspect
  );
  assert.equal(result.item.kind, "geojson", "dataset-format overrides DCAT format");
});

test("legacy datasetId lookup dereferences dataset distributions", async () => {
  const result = await subject.resolveCatalogItem({
    catalogItem: catalogItem({ distributionId: undefined, datasetId: "dataset-id" }),
    registryResponse: {
      id: "dataset-id",
      aspects: {
        "dataset-distributions": {
          distributions: [
            distribution("GeoJSON", "https://files.example.test/from-dataset.geojson")
          ]
        }
      }
    }
  });
  const requestedUrl = new URL(result.requests[0]);

  assert.equal(result.error, undefined);
  assert.equal(requestedUrl.pathname, "/api/v0/registry/records/dataset-id");
  assert.equal(requestedUrl.searchParams.get("aspect"), "dataset-distributions");
  assert.equal(requestedUrl.searchParams.get("optionalAspect"), "dataset-format");
  assert.equal(requestedUrl.searchParams.get("dereference"), "true");
  assert.equal(result.item.kind, "geojson");
});

test("downloadURL takes precedence and accessURL is the fallback", async () => {
  const withBoth = distribution("GeoJSON", "https://files.example.test/download.geojson");
  withBoth.aspects["dcat-distribution-strings"].accessURL =
    "https://files.example.test/access.geojson";
  const downloaded = await subject.resolveDistribution({
    distribution: withBoth,
    catalogItem: catalogItem()
  });
  assert.equal(downloaded.item.url, "https://files.example.test/download.geojson");

  const accessOnly = distribution("GeoJSON", undefined);
  delete accessOnly.aspects["dcat-distribution-strings"].downloadURL;
  accessOnly.aspects["dcat-distribution-strings"].accessURL =
    "https://files.example.test/access.geojson";
  const accessed = await subject.resolveDistribution({
    distribution: accessOnly,
    catalogItem: catalogItem()
  });
  assert.equal(accessed.item.url, "https://files.example.test/access.geojson");
});

test("Storage API rewrite defaults to magda-datasets when no bucket field is supplied", async () => {
  const result = await resolveStorageFixture({
    defaultBucket: undefined,
    datasetBucket: undefined
  });
  assert.equal(result.error, undefined);
  assert.equal(result.item.url, fixture.storage.defaultBucketResult);
});

test("current caller defaultBucket is accepted through catalog resolution", async (t) => {
  const result = await resolveStorageFixture({
    defaultBucket: fixture.storage.callerBucket
  });
  const expected =
    subject.id === "legacy-terria6"
      ? fixture.storage.callerBucketLegacyObservedResult
      : fixture.storage.callerBucketContractResult;

  assert.equal(result.error, undefined);
  assert.equal(result.item.url, expected);
  if (subject.id === "legacy-terria6") t.todo(fixture.storage.knownGap);
});

test("legacy datasetBucket is accepted through catalog resolution", async () => {
  const result = await resolveStorageFixture({
    datasetBucket: fixture.storage.datasetBucket
  });
  assert.equal(result.error, undefined);
  assert.equal(result.item.url, fixture.storage.datasetBucketResult);
});

test("defaultBucket takes precedence when both bucket fields are supplied", async (t) => {
  const result = await resolveStorageFixture({
    defaultBucket: fixture.storage.callerBucket,
    datasetBucket: fixture.storage.datasetBucket
  });
  const expected =
    subject.id === "legacy-terria6"
      ? fixture.storage.conflictLegacyObservedResult
      : fixture.storage.conflictContractResult;

  assert.equal(result.error, undefined);
  assert.equal(result.item.url, expected);
  if (subject.id === "legacy-terria6") t.todo(fixture.storage.knownGap);
});

test("ordinary HTTP distribution URLs are not rewritten", () => {
  const url = "https://files.example.test/example.geojson";
  assert.equal(
    subject.rewriteStorageApiUrl({
      resourceUrl: url,
      bucket: fixture.storage.defaultBucket,
      storageApiUrl: fixture.storage.storageApiUrl
    }),
    url
  );
});

for (const testCase of fixture.formats) {
  test(`legacy format mapping: ${testCase.name}`, async () => {
    const result = await subject.resolveDistribution({
      distribution: distribution(testCase.format, testCase.url),
      catalogItem: catalogItem({
        selectedWmsLayerName: testCase.selectedWmsLayerName,
        selectedWfsFeatureTypeName: testCase.selectedWfsFeatureTypeName
      })
    });

    assert.equal(result.error, undefined);
    assert.equal(result.item.kind, testCase.expectedType);
    assert.equal(result.item.zoomOnEnable, true);
    if (testCase.expectedSelectionProperty) {
      assert.equal(
        result.item[testCase.expectedSelectionProperty],
        testCase.expectedSelection,
        "an explicit caller-selected WMS/WFS member is authoritative"
      );
    }
    if (testCase.expectedType === "wms" || testCase.expectedType === "wfs") {
      assert.equal(new URL(result.item.url).search, "", "capability query is stripped");
    }
    if (testCase.expectedType === "esri-featureServer") {
      assert.equal(
        result.item.url,
        testCase.url,
        "explicit FeatureServer layer is preserved"
      );
    }
  });
}

test("a resolved item's loading transition posts loading complete", async () => {
  const result = await subject.resolveDistribution({
    distribution: distribution("GeoJSON", "https://files.example.test/example.geojson"),
    catalogItem: catalogItem()
  });

  result.transitionLoading(true);
  assert.equal(result.messages.length, 0);
  result.transitionLoading(false);
  assert.deepEqual(result.messages, [{ data: "loading complete", targetOrigin: "*" }]);
});

test("WMS without a caller selection falls back to the first service member", async () => {
  const result = await subject.resolveDistribution({
    distribution: distribution("WMS", "https://maps.example.test/wms"),
    catalogItem: catalogItem(),
    groupItems: [
      { kind: "wms", layers: "workspace:first" },
      { kind: "wms", layers: "workspace:second" }
    ]
  });
  assert.equal(result.error, undefined);
  assert.equal(result.item.layers, "workspace:first");
});

test("WFS without a caller selection falls back to the first service member", async () => {
  const result = await subject.resolveDistribution({
    distribution: distribution("WFS", "https://features.example.test/wfs"),
    catalogItem: catalogItem(),
    groupItems: [
      { kind: "wfs", typeNames: "workspace:first" },
      { kind: "wfs", typeNames: "workspace:second" }
    ]
  });
  assert.equal(result.error, undefined);
  assert.equal(result.item.typeNames, "workspace:first");
});

test("unsupported formats post the legacy JSON error shape", async () => {
  const result = await subject.resolveCatalogItem({
    catalogItem: catalogItem(),
    registryResponse: distribution(
      fixture.errors.unsupportedFormat,
      "https://files.example.test/example.pdf"
    )
  });

  assert.ok(result.error);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].targetOrigin, "*");
  const error = JSON.parse(result.messages[0].data);
  assert.deepEqual(Object.keys(error).sort(), fixture.errors.legacyShape.slice().sort());
  assert.equal(error.type, "error");
  assert.match(error.title, /compatible distributions/i);
});

test("Registry/network failures post an error and terminate the legacy protocol", async () => {
  const result = await subject.resolveCatalogItem({
    catalogItem: catalogItem(),
    registryError: new Error("registry unavailable")
  });

  assert.match(result.error.message, /registry unavailable/);
  const error = JSON.parse(result.messages.at(-1).data);
  assert.equal(error.type, "error");
  assert.equal(error.message, "registry unavailable");
});

test("parent harness waits for ready and terminates on loading complete", () => {
  const posted = [];
  const iframeWindow = {
    postMessage: (data, targetOrigin) => posted.push({ data, targetOrigin })
  };
  const handler = createMessageHandler({
    iframeWindow,
    startData: fixture.caller.startData
  });

  handler.onMessage({ source: {}, data: "ready" });
  assert.equal(posted.length, 0, "messages from other windows are ignored");

  handler.onMessage({ source: iframeWindow, data: "ready" });
  assert.deepEqual(posted, [{ data: fixture.caller.startData, targetOrigin: "*" }]);
  assert.equal(handler.state.loading, true);
  assert.equal(handler.state.terminal, false);

  handler.onMessage({ source: iframeWindow, data: "loading complete" });
  assert.equal(handler.state.loading, false);
  assert.equal(handler.state.terminal, true);
  assert.equal(handler.state.error, undefined);
});

test("parent harness terminates on a legacy JSON error", () => {
  const iframeWindow = { postMessage() {} };
  const handler = createMessageHandler({
    iframeWindow,
    startData: fixture.caller.startData
  });
  const error = {
    type: "error",
    title: "Fixture error",
    message: "The selected item failed to load"
  };

  handler.onMessage({ source: iframeWindow, data: JSON.stringify(error) });

  assert.equal(handler.state.loading, false);
  assert.equal(handler.state.terminal, true);
  assert.deepEqual(handler.state.error, error);
});

test("parent harness ignores malformed and unrelated messages", () => {
  const iframeWindow = { postMessage() {} };
  const handler = createMessageHandler({
    iframeWindow,
    startData: fixture.caller.startData
  });

  handler.onMessage({ source: iframeWindow, data: "not json" });
  handler.onMessage({
    source: iframeWindow,
    data: JSON.stringify({ type: "progress", message: "still loading" })
  });

  assert.equal(handler.state.loading, true);
  assert.equal(handler.state.terminal, false);
  assert.equal(handler.state.error, undefined);
});

test("browser harness wires the preview hash and parent message listener", () => {
  const html = fs.readFileSync(path.join(__dirname, "harness/parent.html"), "utf8");
  assert.match(html, /iframe\.src = stubUrl \+ MagdaPreviewParentHarness\.IFRAME_HASH/);
  assert.match(html, /window\.addEventListener\("message", parentHarness\.onMessage\)/);
});
