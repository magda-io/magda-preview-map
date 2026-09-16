"use strict";

const fs = require("node:fs");
const path = require("node:path");

const inputVersion = process.argv[2] || "";
const taggedSemanticVersion =
  /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
if (!taggedSemanticVersion.test(inputVersion)) {
  throw new Error(
    `Invalid version: ${inputVersion || "<missing>"}. Expected semantic version with a leading v.`
  );
}
const version = inputVersion.slice(1);

const root = path.resolve(__dirname, "..");
const packagePath = path.join(root, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
packageJson.version = version;

const chartPath = path.join(
  root,
  "deploy",
  "helm",
  "magda-preview-map",
  "Chart.yaml"
);
const chart = fs.readFileSync(chartPath, "utf8");
if (!/^version: .+$/m.test(chart)) throw new Error("Chart version is missing");

fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
fs.writeFileSync(
  chartPath,
  chart.replace(/^version: .+$/m, `version: ${version}`)
);
