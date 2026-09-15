"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const packageJson = JSON.parse(read("package.json"));

test("foundation pins the TerriaMap v0.4.8 runtime versions", () => {
  assert.equal(packageJson.engines.node, ">= 22");
  assert.equal(packageJson.devDependencies.terriajs, "8.13.0");
  assert.equal(packageJson.dependencies["terriajs-server"], "5.0.0");
  assert.match(packageJson.devDependencies.webpack, /^\^5\./);
  assert.match(packageJson.devDependencies.react, /^\^18\./);
  assert.equal("node-sass" in packageJson.devDependencies, false);
  assert.equal("extract-text-webpack-plugin" in packageJson.devDependencies, false);
});

test("legacy TerriaJS 6 production shell is removed", () => {
  assert.equal(fs.existsSync(path.join(root, "lib/Models/MagdaCatalogItem.js")), false);
  assert.equal(fs.existsSync(path.join(root, "buildprocess/webpack.config.hot.js")), false);
  assert.equal(fs.existsSync(path.join(root, "devserverconfig.json")), false);
  assert.equal(fs.existsSync(path.join(root, "lib/Views/RelatedMaps.jsx")), false);
});

test("obsolete v6 characterization and NationalMap assets are removed", () => {
  [
    "test/characterization/legacy/MagdaCatalogItem.js",
    "test/characterization/support/legacy-terria6-driver.cjs",
    "wwwroot/public",
    "wwwroot/data",
    "deploy/aws",
    "deploy/helm/terria",
    "varnish"
  ].forEach((file) => assert.equal(fs.existsSync(path.join(root, file)), false));

  for (const file of ["wwwroot/404.html", "wwwroot/500.html"]) {
    const page = read(file);
    assert.doesNotMatch(page, /NationalMap|\/public\//);
  }
});

test("React 18 root renders the upstream StandardUserInterface", () => {
  const render = read("lib/Views/render.jsx");
  const ui = read("lib/Views/UserInterface.jsx");

  assert.match(render, /createRoot/);
  assert.doesNotMatch(render, /ReactDOM\.render/);
  assert.match(ui, /StandardUserInterface/);
});

test("Webpack 5 foundation uses the modern Sass pipeline", () => {
  const webpack = read("buildprocess/webpack.config.js");

  assert.match(webpack, /configureWebpackForTerriaJS/);
  assert.match(webpack, /MiniCssExtractPlugin/);
  assert.match(webpack, /sass-loader/);
  assert.doesNotMatch(webpack, /extract-text-webpack-plugin/);
});

test("application keeps the hash hook and secure preview lifecycle bridge", () => {
  const application = read("index.js");

  assert.match(application, /updateApplicationOnHashChange/);
  assert.match(application, /configureMagdaPreviewLifecycle/);
  assert.match(application, /registerCatalogMembers\(\)/);
  assert.match(application, /registerMagdaCatalogMembers\(terria\)/);
  assert.match(application, /beforeRestoreAppState/);
});

test("preview defaults to the free OpenStreetMap basemap", () => {
  const init = JSON.parse(read("wwwroot/init/simple.json"));

  assert.equal(init.baseMaps.defaultBaseMapId, "basemap-openstreetmap");
});

test("preview mode hides application chrome but retains map navigation", () => {
  const page = read("wwwroot/index.ejs");
  const previewMode = read("lib/Views/configurePreviewMode.ts");
  const callerFixture = JSON.parse(
    read("test/characterization/fixtures/magda-preview-contract.json")
  );

  assert.match(page, /<div id="ui"><\/div>/);
  assert.match(previewMode, /userProperties\.get\("mode"\) !== "preview"/);
  assert.match(previewMode, /viewState\.isMapFullScreen = true/);
  assert.match(previewMode, /"menu-bar"/);
  assert.match(previewMode, /"show-workbench"/);
  assert.doesNotMatch(previewMode, /"map-navigation"/);
  assert.doesNotMatch(previewMode, /"zoom"/);
  assert.equal(callerFixture.caller.iframeHash, "#mode=preview&hideExplorerPanel=1");
});
