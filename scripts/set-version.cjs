"use strict";

const fs = require("node:fs");
const path = require("node:path");

const version = (process.argv[2] || "").replace(/^v/, "");
const semanticVersion =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
if (!semanticVersion.test(version)) {
  throw new Error(
    `Invalid semantic version: ${process.argv[2] || "<missing>"}`
  );
}

const root = path.resolve(__dirname, "..");
const packagePath = path.join(root, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
packageJson.version = version;
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

const chartPath = path.join(
  root,
  "deploy",
  "helm",
  "magda-preview-map",
  "Chart.yaml"
);
const chart = fs.readFileSync(chartPath, "utf8");
if (!/^version: .+$/m.test(chart)) throw new Error("Chart version is missing");
fs.writeFileSync(
  chartPath,
  chart.replace(/^version: .+$/m, `version: ${version}`)
);
