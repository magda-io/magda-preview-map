"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const swc = require("@swc/core");

const root = path.resolve(__dirname, "../..");

function compile(file, localRequire = require) {
  const { code } = swc.transformSync(fs.readFileSync(file, "utf8"), {
    filename: file,
    jsc: { parser: { syntax: "typescript" }, target: "es2022" },
    module: { type: "commonjs" }
  });
  const loaded = { exports: {} };
  Function(
    "module",
    "exports",
    "require",
    code
  )(loaded, loaded.exports, localRequire);
  return loaded.exports;
}

const compatibility = compile(
  path.join(root, "lib/Models/magdaPreviewCompatibility.ts")
);
const catalog = compile(path.join(root, "lib/Models/magdaCatalog.ts"), (r) =>
  r === "./magdaPreviewCompatibility" ? compatibility : require(r)
);

function withLocation(href, fn) {
  const previous = globalThis.location;
  globalThis.location = { href };
  try {
    return fn();
  } finally {
    if (previous === undefined) delete globalThis.location;
    else globalThis.location = previous;
  }
}

function datasetRecord(id, title, name) {
  return {
    id,
    name,
    aspects: title ? { "dcat-dataset-strings": { title } } : {}
  };
}

const settings = {
  url: "/some-prefix/",
  storageApiUrl: "/some-prefix/api/v0/storage/",
  defaultBucket: "custom-bucket"
};

function fullMapStartData(itemOverrides = {}) {
  return {
    initSources: [
      {
        catalog: [
          {
            type: "magda-item",
            name: "Opened dataset",
            distributionId: "dist-1",
            ...settings,
            isEnabled: true,
            zoomOnEnable: true,
            ...itemOverrides
          }
        ],
        baseMapName: "Positron (Light)"
      }
    ]
  };
}

test("registers magda-catalog-group beside magda-item, not upstream magda", () => {
  const registration = fs.readFileSync(
    path.join(root, "lib/Models/registerMagdaCatalogMembers.ts"),
    "utf8"
  );
  const group = fs.readFileSync(
    path.join(root, "lib/Models/MagdaCatalogGroup.ts"),
    "utf8"
  );

  assert.equal(catalog.MAGDA_CATALOG_GROUP_TYPE, "magda-catalog-group");
  assert.match(group, /static readonly type = MAGDA_CATALOG_GROUP_TYPE/);
  assert.match(
    registration,
    /CatalogMemberFactory\.register\(MagdaCatalogGroup\.type, MagdaCatalogGroup\)/
  );
  assert.match(registration, /MagdaPreviewReference\.type/);
  assert.doesNotMatch(registration, /MagdaReference\b(?!.*Preview)/);
  assert.doesNotMatch(registration, /["']magda["']/);
});

test("builds the first bounded Registry dataset page for an absolute base", () => {
  const url = new URL(
    catalog.buildRegistryRecordsListUrl({ url: "https://magda.example.test" })
  );
  assert.equal(url.origin, "https://magda.example.test");
  assert.equal(url.pathname, "/api/v0/registry/records");
  assert.equal(url.searchParams.get("aspect"), "dcat-dataset-strings");
  assert.equal(url.searchParams.get("limit"), "50");
  assert.equal(url.searchParams.has("pageToken"), false);
  assert.equal(url.searchParams.has("dereference"), false);
});

test("resolves a root-relative base against the app origin, not the UI path", () => {
  const url = withLocation("https://magda.example.test/preview-map/", () =>
    catalog.buildRegistryRecordsListUrl({ url: "/" })
  );
  assert.equal(
    url,
    "https://magda.example.test/api/v0/registry/records?aspect=dcat-dataset-strings&limit=50"
  );
});

test("keeps a non-root deployment prefix", () => {
  const url = withLocation(
    "https://magda.example.test/some-prefix/preview-map/",
    () => catalog.buildRegistryRecordsListUrl({ url: "/some-prefix" })
  );
  assert.equal(new URL(url).pathname, "/some-prefix/api/v0/registry/records");
});

test("record and list URLs share one base resolution", () => {
  withLocation("https://magda.example.test/some-prefix/preview-map/", () => {
    const list = new URL(
      catalog.buildRegistryRecordsListUrl({ url: "/some-prefix/" })
    );
    const record = new URL(
      compatibility.buildRegistryRecordUrl({
        url: "/some-prefix/",
        datasetId: "ds-1"
      })
    );
    assert.equal(list.origin, record.origin);
    assert.equal(
      record.pathname,
      `${list.pathname}/ds-1`,
      "the dataset record lives under the list endpoint"
    );
  });
});

test("continuation pages carry the Registry nextPageToken", () => {
  const url = new URL(
    catalog.buildRegistryRecordsListUrl({
      url: "https://magda.example.test/",
      pageSize: 20,
      pageToken: "token/with?chars"
    })
  );
  assert.equal(url.searchParams.get("pageToken"), "token/with?chars");
  assert.equal(url.searchParams.get("limit"), "20");
});

test("page size is bounded", () => {
  assert.equal(catalog.effectiveCatalogPageSize(undefined), 50);
  assert.equal(catalog.effectiveCatalogPageSize(0), 1);
  assert.equal(catalog.effectiveCatalogPageSize(10.7), 10);
  assert.equal(catalog.effectiveCatalogPageSize(100000), 100);
  assert.equal(catalog.effectiveCatalogPageSize(Number.NaN), 50);
});

test("parses a Registry page and ignores records without IDs", () => {
  const page = catalog.parseRegistryRecordsPage({
    records: [datasetRecord("ds-1", "One"), { name: "no id" }, null],
    hasMore: true,
    nextPageToken: "next"
  });
  assert.deepEqual(
    page.records.map((record) => record.id),
    ["ds-1"]
  );
  assert.equal(page.hasMore, true);
  assert.equal(page.nextPageToken, "next");

  const last = catalog.parseRegistryRecordsPage({
    records: [],
    hasMore: false
  });
  assert.equal(last.hasMore, false);
  // Without a token there is nothing to continue from.
  assert.equal(
    catalog.parseRegistryRecordsPage({ records: [], hasMore: true }).hasMore,
    false
  );
  assert.deepEqual(catalog.parseRegistryRecordsPage(undefined).records, []);
});

test("titles fall back from dataset title to record name to record ID", () => {
  assert.equal(
    catalog.catalogDatasetTitle(datasetRecord("ds-1", "Title", "Name")),
    "Title"
  );
  assert.equal(
    catalog.catalogDatasetTitle(datasetRecord("ds-1", "", "Name")),
    "Name"
  );
  assert.equal(catalog.catalogDatasetTitle(datasetRecord("ds-1")), "ds-1");
});

test("child IDs are deterministic and independent of page boundaries", () => {
  assert.equal(
    catalog.catalogDatasetMemberId("magda-data-catalog", "ds/1 x"),
    "magda-data-catalog/dataset/ds%2F1%20x"
  );
  assert.equal(
    catalog.catalogDatasetMemberId("magda-data-catalog", "ds/1 x"),
    catalog.catalogDatasetMemberId("magda-data-catalog", "ds/1 x")
  );
  assert.equal(
    catalog.catalogContinuationId("magda-data-catalog", "a/b"),
    "magda-data-catalog/page/a%2Fb"
  );
});

test("child references resolve by datasetId with inherited deployment values", () => {
  const json = catalog.catalogDatasetReferenceJson(
    datasetRecord("ds-1", "Roads"),
    { ...settings, datasetBucket: undefined }
  );
  assert.deepEqual(json, {
    ...settings,
    name: "Roads",
    datasetId: "ds-1",
    isMappable: true
  });
  // Browsing must not load or zoom anything.
  assert.equal("isEnabled" in json, false);
  assert.equal("zoomOnEnable" in json, false);
  assert.equal("distributionId" in json, false);
});

test("continuation groups carry the token, root ID and deployment values", () => {
  assert.deepEqual(
    catalog.catalogContinuationJson(
      "next",
      "magda-data-catalog",
      500,
      settings
    ),
    {
      ...settings,
      name: "More datasets…",
      pageToken: "next",
      rootCatalogId: "magda-data-catalog",
      pageSize: 100
    }
  );
});

test("dataset records are listed without eager distribution requests", () => {
  // The catalog-page URL requests only lightweight dataset metadata.
  const url = new URL(
    catalog.buildRegistryRecordsListUrl({ url: "https://magda.example.test/" })
  );
  assert.deepEqual(url.searchParams.getAll("aspect"), ["dcat-dataset-strings"]);
  assert.equal(url.searchParams.has("optionalAspect"), false);
  assert.equal(url.searchParams.has("dereference"), false);
});

test("start data: compact preview mode is unchanged", () => {
  const data = fullMapStartData();
  assert.equal(
    catalog.addMagdaCatalogToStartData(data, { mode: "preview" }),
    data
  );
});

test("start data: full mode appends one root copying the magda-item settings", () => {
  const data = fullMapStartData({ datasetBucket: "legacy-bucket" });
  const result = catalog.addMagdaCatalogToStartData(data, {});
  const [item, rootGroup] = result.initSources[0].catalog;

  assert.equal(item, data.initSources[0].catalog[0]);
  assert.equal(data.initSources[0].catalog.length, 1, "input not mutated");
  assert.equal(result.initSources[0].baseMapName, "Positron (Light)");
  assert.deepEqual(rootGroup, {
    id: "magda-data-catalog",
    type: "magda-catalog-group",
    name: "Magda data catalog",
    ...settings,
    datasetBucket: "legacy-bucket",
    pageSize: 50
  });
});

test("start data: no magda-item, no URL, or an existing root adds nothing", () => {
  const noItem = { initSources: [{ catalog: [{ type: "geojson" }] }] };
  assert.equal(catalog.addMagdaCatalogToStartData(noItem, {}), noItem);

  const noUrl = fullMapStartData({ url: undefined });
  assert.equal(catalog.addMagdaCatalogToStartData(noUrl, {}), noUrl);

  const once = catalog.addMagdaCatalogToStartData(fullMapStartData(), {});
  assert.equal(catalog.addMagdaCatalogToStartData(once, {}), once);

  const data = fullMapStartData();
  assert.equal(
    catalog.addMagdaCatalogToStartData(data, { hasCatalogRoot: true }),
    data
  );
  assert.equal(
    catalog.addMagdaCatalogToStartData("not start data", {}),
    "not start data"
  );
});

function distribution(id, format, url) {
  return {
    id,
    aspects: { "dcat-distribution-strings": { format, downloadURL: url } }
  };
}

function datasetWith(...distributions) {
  return {
    id: "ds-1",
    aspects: { "dataset-distributions": { distributions } }
  };
}

test("dataset-level resolution follows the preview format preference", () => {
  const properties = { url: "https://magda.example.test/", datasetId: "ds-1" };
  const pick = (...distributions) =>
    compatibility.findCompatibleDefinition(
      datasetWith(...distributions),
      properties
    )?.type;

  const csv = distribution("csv", "CSV", "https://data.example.test/a.csv");
  const geojson = distribution(
    "gj",
    "GeoJSON",
    "https://data.example.test/a.geojson"
  );
  const kml = distribution("kml", "KML", "https://data.example.test/a.kml");
  const wfs = distribution("wfs", "WFS", "https://ows.example.test/wfs");
  const wms = distribution("wms", "WMS", "https://ows.example.test/wms");
  const mapServer = distribution(
    "ms",
    "Esri REST",
    "https://esri.example.test/arcgis/rest/services/X/MapServer"
  );
  const featureServer = distribution(
    "fs",
    "Esri REST",
    "https://esri.example.test/arcgis/rest/services/X/FeatureServer/0"
  );

  assert.equal(pick(csv, geojson, kml, wfs, wms), "wms");
  assert.equal(pick(featureServer, wfs, mapServer), "esri-mapServer");
  assert.equal(pick(kml, featureServer, wfs), "wfs");
  assert.equal(pick(csv, featureServer, geojson), "esri-featureServer");
  assert.equal(pick(kml, csv, geojson), "geojson");
  assert.equal(pick(kml, csv), "csv");
  assert.equal(pick(kml), "kml");
  // Unsupported formats and non-service Esri URLs are still skipped.
  assert.equal(
    pick(
      distribution("pdf", "PDF", "https://data.example.test/a.pdf"),
      distribution(
        "scene",
        "Esri REST",
        "https://esri.example.test/arcgis/rest/services/X/SceneServer"
      )
    ),
    undefined
  );
});

test("equally preferred distributions keep Registry order", () => {
  const first = distribution("first", "WMS", "https://ows.example.test/first");
  const second = distribution(
    "second",
    "WMS",
    "https://ows.example.test/second"
  );
  const definition = compatibility.findCompatibleDefinition(
    datasetWith(first, second),
    { url: "https://magda.example.test/", datasetId: "ds-1" }
  );
  assert.equal(definition.url, "https://ows.example.test/first");
});
