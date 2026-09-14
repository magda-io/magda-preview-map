"use strict";

// Keep the contract tests independent of the application generation. The frozen
// TerriaJS 6 subject remains selectable for historical comparison.
const driverPath = process.env.MAGDA_CHARACTERIZATION_SUBJECT;

if (driverPath) {
  module.exports = require(require("node:path").resolve(driverPath));
} else {
  module.exports = require("./terria8-adapter-driver.cjs");
}
