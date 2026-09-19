"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const swc = require("@swc/core");

const root = path.resolve(__dirname, "../..");
const fixture = require("../characterization/fixtures/magda-preview-contract.json");

function loadCompatibilityModule() {
  const source = fs.readFileSync(
    path.join(root, "lib/Models/magdaPreviewCompatibility.ts"),
    "utf8"
  );
  const { code } = swc.transformSync(source, {
    filename: "magdaPreviewCompatibility.ts",
    jsc: { parser: { syntax: "typescript" }, target: "es2022" },
    module: { type: "commonjs" }
  });
  const module = { exports: {} };
  Function("module", "exports", "require", code)(module, module.exports, require);
  return module.exports;
}

const compatibility = loadCompatibilityModule();

function distribution(format, url, extraAspects = {}) {
  return {
    id: "dist-id",
    aspects: {
      "dcat-distribution-strings": {
        format,
        downloadURL: url,
        accessURL: "https://files.example.test/access-fallback"
      },
      ...extraAspects
    }
  };
}

function properties(overrides = {}) {
  return {
    name: "Adapter fixture",
    url: "https://catalog.example.test/",
    storageApiUrl: fixture.storage.storageApiUrl,
    distributionId: "dist-id",
    ...overrides
  };
}

test("registers the compatibility reference under the unchanged magda-item type", () => {
  const registration = fs.readFileSync(
    path.join(root, "lib/Models/registerMagdaCatalogMembers.ts"),
    "utf8"
  );
  const reference = fs.readFileSync(
    path.join(root, "lib/Models/MagdaPreviewReference.ts"),
    "utf8"
  );

  assert.equal(compatibility.MAGDA_ITEM_TYPE, "magda-item");
  assert.match(reference, /static readonly type = "magda-item"/);
  assert.match(registration, /CatalogMemberFactory\.register/);
});

test("builds current distribution and legacy dataset Registry requests", () => {
  const distributionUrl = new URL(
    compatibility.buildRegistryRecordUrl(properties())
  );
  assert.equal(distributionUrl.pathname, fixture.registry.distributionPath);
  assert.equal(distributionUrl.searchParams.get("aspect"), "dcat-distribution-strings");
  assert.equal(distributionUrl.searchParams.get("optionalAspect"), "dataset-format");
  assert.equal(distributionUrl.searchParams.has("dereference"), false);

  const datasetUrl = new URL(
    compatibility.buildRegistryRecordUrl(
      properties({ distributionId: undefined, datasetId: "dataset-id" })
    )
  );
  assert.equal(datasetUrl.pathname, "/api/v0/registry/records/dataset-id");
  assert.equal(datasetUrl.searchParams.get("aspect"), "dataset-distributions");
  assert.equal(datasetUrl.searchParams.get("dereference"), "true");
});

test("resolves a relative magda base (config.baseUrl '/') against the app origin", () => {
  // Magda's default `config.baseUrl` is the relative "/" (same-origin). The web
  // client passes it as the magda-item `url`, so buildRegistryRecordUrl must not
  // feed it straight to `new URL(path, "/")` (which throws "Invalid base URL").
  const previous = globalThis.location;
  globalThis.location = {
    href: "https://preview.example.test/preview-map/index.html"
  };
  try {
    const url = new URL(
      compatibility.buildRegistryRecordUrl(properties({ url: "/" }))
    );
    assert.equal(url.origin, "https://preview.example.test");
    assert.equal(url.pathname, "/api/v0/registry/records/dist-id");
    assert.equal(url.searchParams.get("aspect"), "dcat-distribution-strings");
  } finally {
    if (previous === undefined) {
      delete globalThis.location;
    } else {
      globalThis.location = previous;
    }
  }
});

test("relative base '/' ignores a non-root UI path (uiBaseUrl) and targets the origin API root", () => {
  // When the web UI is hosted under a non-"/" path (web-server `uiBaseUrl`,
  // e.g. "/xxx/test-ui/"), the preview iframe's location is under that prefix,
  // but Magda's API base is still origin-root ("/"). The UI prefix must NOT
  // leak into the Registry request.
  const previous = globalThis.location;
  globalThis.location = {
    href: "https://preview.example.test/xxx/test-ui/preview-map/index.html"
  };
  try {
    const url = new URL(
      compatibility.buildRegistryRecordUrl(properties({ url: "/" }))
    );
    assert.equal(
      url.toString().split("?")[0],
      "https://preview.example.test/api/v0/registry/records/dist-id"
    );
  } finally {
    if (previous === undefined) delete globalThis.location;
    else globalThis.location = previous;
  }
});

test("relative base carrying a deployment path prefix keeps that prefix", () => {
  // If the whole Magda deployment is served under a path prefix, config.baseUrl
  // is that absolute-path prefix (e.g. "/xxx/test-ui/") and the Registry lives
  // under it. Resolving against the app origin must preserve the prefix.
  const previous = globalThis.location;
  globalThis.location = {
    href: "https://preview.example.test/xxx/test-ui/preview-map/index.html"
  };
  try {
    const url = new URL(
      compatibility.buildRegistryRecordUrl(properties({ url: "/xxx/test-ui/" }))
    );
    assert.equal(
      url.toString().split("?")[0],
      "https://preview.example.test/xxx/test-ui/api/v0/registry/records/dist-id"
    );
  } finally {
    if (previous === undefined) delete globalThis.location;
    else globalThis.location = previous;
  }
});

test("dataset-format overrides DCAT and downloadURL precedes accessURL", () => {
  const resolved = compatibility.definitionFromDistribution(
    distribution("application/pdf", "https://files.example.test/data.geojson", {
      "dataset-format": { format: "GeoJSON" }
    }),
    properties()
  );
  assert.equal(resolved.type, "geojson");
  assert.equal(resolved.url, "https://files.example.test/data.geojson");

  const accessOnly = distribution("GeoJSON", undefined);
  delete accessOnly.aspects["dcat-distribution-strings"].downloadURL;
  assert.equal(
    compatibility.definitionFromDistribution(accessOnly, properties()).url,
    "https://files.example.test/access-fallback"
  );
});

test("Storage API rewrite uses defaultBucket, datasetBucket, then fallback", () => {
  const pseudoUrl = fixture.storage.pseudoUrl;
  const storageApiUrl = fixture.storage.storageApiUrl;
  const cases = [
    [{ defaultBucket: fixture.storage.callerBucket }, fixture.storage.callerBucketContractResult],
    [{ datasetBucket: fixture.storage.datasetBucket }, fixture.storage.datasetBucketResult],
    [
      {
        defaultBucket: fixture.storage.callerBucket,
        datasetBucket: fixture.storage.datasetBucket
      },
      fixture.storage.conflictContractResult
    ],
    [{}, fixture.storage.defaultBucketResult]
  ];

  for (const [bucketFields, expected] of cases) {
    const bucket = compatibility.effectiveDatasetBucket(bucketFields);
    assert.equal(
      compatibility.rewriteStorageApiUrl(pseudoUrl, storageApiUrl, bucket),
      expected
    );
  }
});

test("maps all compatibility formats to native TerriaJS 8 model types", () => {
  for (const testCase of fixture.formats) {
    const resolved = compatibility.definitionFromDistribution(
      distribution(testCase.format, testCase.url),
      properties({
        selectedWmsLayerName: testCase.selectedWmsLayerName,
        selectedWfsFeatureTypeName: testCase.selectedWfsFeatureTypeName
      })
    );

    assert.ok(resolved, testCase.name);
    assert.equal(resolved.type, testCase.expectedType, testCase.name);
    if (testCase.expectedSelectionProperty) {
      assert.equal(
        resolved[testCase.expectedSelectionProperty],
        testCase.expectedSelection,
        `${testCase.name}: explicit caller selection wins`
      );
    }
    if (resolved.type === "wms" || resolved.type === "wfs") {
      assert.equal(new URL(resolved.url).search, "");
    }
    if (resolved.type === "esri-featureServer") {
      assert.equal(resolved.url, testCase.url);
    }
  }
});

test("OWS cleanup is case-insensitive and preserves unrelated parameters", () => {
  const cleaned = new URL(
    compatibility.cleanOwsUrl(
      "https://maps.example.test/wms?REQUEST=GetCapabilities&SERVICE=WMS&layerName=example&token=keep"
    )
  );
  assert.equal(cleaned.searchParams.get("token"), "keep");
  assert.equal(cleaned.searchParams.has("REQUEST"), false);
  assert.equal(cleaned.searchParams.has("SERVICE"), false);
  assert.equal(cleaned.searchParams.has("layerName"), false);
});

test("generic Esri labels require MapServer or FeatureServer URL evidence", () => {
  assert.equal(
    compatibility.definitionFromDistribution(
      distribution("ESRI REST", "https://services.example.test/not-an-esri-service"),
      properties()
    ),
    undefined
  );
});

test("FeatureServer roots and explicit layers preserve the native request strategy", () => {
  const rootUrl = "https://services.example.test/arcgis/rest/services/example/FeatureServer";
  const layerUrl = `${rootUrl}/3`;
  assert.equal(compatibility.isFeatureServerRoot(rootUrl), true);
  assert.equal(compatibility.isFeatureServerRoot(layerUrl), false);

  const source = fs.readFileSync(
    path.join(root, "lib/Models/MagdaPreviewReference.ts"),
    "utf8"
  );
  assert.match(source, /ArcGisFeatureServerCatalogGroup/);
  assert.match(source, /ArcGisFeatureServerCatalogItem/);
  assert.match(source, /isFeatureServerRoot\(definition\.url\)/);
  assert.doesNotMatch(source, /tileRequests/);

  const nativeItem = fs.readFileSync(
    path.join(
      root,
      "node_modules/terriajs/lib/Models/Catalog/Esri/ArcGisFeatureServerCatalogItem.ts"
    ),
    "utf8"
  );
  assert.match(nativeItem, /ProtomapsArcGisPbfSource/);
  assert.match(nativeItem, /if \(this\.tileRequests\)/);
  assert.match(nativeItem, /resultRecordCount/);
  assert.match(nativeItem, /resultOffset/);
});

test("WMS and WFS use native groups only for missing-selection fallback", () => {
  const source = fs.readFileSync(
    path.join(root, "lib/Models/MagdaPreviewReference.ts"),
    "utf8"
  );
  assert.match(source, /definition\.type === "wms" && !definition\.layers/);
  assert.match(source, /WebMapServiceCatalogGroup/);
  assert.match(source, /definition\.type === "wfs" && !definition\.typeNames/);
  assert.match(source, /WebFeatureServiceCatalogGroup/);
});

test("WFS target remains bounded by the native maxFeatures implementation", () => {
  const reference = fs.readFileSync(
    path.join(root, "lib/Models/MagdaPreviewReference.ts"),
    "utf8"
  );
  const traits = fs.readFileSync(
    path.join(
      root,
      "node_modules/terriajs/lib/Traits/TraitsClasses/WebFeatureServiceCatalogItemTraits.ts"
    ),
    "utf8"
  );
  const item = fs.readFileSync(
    path.join(
      root,
      "node_modules/terriajs/lib/Models/Catalog/Ows/WebFeatureServiceCatalogItem.ts"
    ),
    "utf8"
  );

  assert.equal(compatibility.WFS_DEFAULT_MAX_FEATURES, 1000);
  assert.match(reference, /maxFeatures:[\s\S]*WFS_DEFAULT_MAX_FEATURES/);
  assert.match(traits, /maxFeatures = 1000/);
  assert.match(item, /maxFeatures: this\.maxFeatures/);
});

test("legacy enable and zoom fields bridge to the modern workbench", () => {
  const reference = fs.readFileSync(
    path.join(root, "lib/Models/MagdaPreviewReference.ts"),
    "utf8"
  );
  assert.match(reference, /this\.terria\.workbench[\s\S]*\.add\(this\)/);
  assert.match(reference, /Promise\.resolve\(\)\.then\(\(\) => this\.updateEnabledState/);
  assert.match(reference, /resolvedSeverity === TerriaErrorSeverity\.Error/);
  assert.match(reference, /zoomOnAddToWorkbench: this\.zoomOnEnable/);
});
