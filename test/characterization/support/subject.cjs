"use strict";

// Keep the contract tests independent of the application generation. Issue #29 can
// replace this driver with a TerriaJS 8 driver without changing fixtures or tests.
const driverPath = process.env.MAGDA_CHARACTERIZATION_SUBJECT;

if (driverPath) {
  module.exports = require(require("node:path").resolve(driverPath));
} else {
  module.exports = require("./legacy-terria6-driver.cjs");
}
