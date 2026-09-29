"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const swc = require("@swc/core");

const root = path.resolve(__dirname, "../..");

function loadConfigurePreviewMode() {
  const file = path.join(root, "lib/Views/configurePreviewMode.ts");
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
  )(loaded, loaded.exports, (request) => {
    if (request === "mobx") return { runInAction: (fn) => fn() };
    return require(request);
  });
  return loaded.exports.default;
}

const configurePreviewMode = loadConfigurePreviewMode();

function app(mode) {
  const userProperties = new Map(mode === undefined ? [] : [["mode", mode]]);
  const terria = { userProperties, elements: new Map() };
  const viewState = { isMapFullScreen: false, explorerPanelIsVisible: true };
  return { terria, viewState };
}

test("compact preview mode hides the full Terria chrome", () => {
  const { terria, viewState } = app("preview");
  configurePreviewMode(terria, viewState);

  assert.equal(viewState.isMapFullScreen, true);
  assert.equal(viewState.explorerPanelIsVisible, false);
  assert.deepEqual(terria.elements.get("menu-bar"), { visible: false });
  assert.deepEqual(terria.elements.get("show-workbench"), { visible: false });
});

for (const mode of [undefined, "full"]) {
  test(`full map (mode=${mode}) keeps the full Terria chrome`, () => {
    const { terria, viewState } = app(mode);
    configurePreviewMode(terria, viewState);

    assert.equal(viewState.isMapFullScreen, false);
    assert.equal(viewState.explorerPanelIsVisible, true);
    assert.equal(terria.elements.size, 0);
  });
}
