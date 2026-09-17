"use strict";

const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("default Helm chart uses the canonical GHCR image", () => {
  const rendered = execFileSync(
    "helm",
    ["template", "preview", "deploy/helm/magda-preview-map"],
    { cwd: root, encoding: "utf8" }
  );

  assert.match(
    rendered,
    /image: "ghcr\.io\/magda-io\/magda-preview-map:[^"]+"/
  );
});

test("workflow semantic-version contract accepts only publishable tags", () => {
  const workflow = read(".github/workflows/set-version.yaml");
  const versionRegex = workflow.match(/SEMVER_REGEX="([^"]+)"/)[1];
  const matches = (version) =>
    spawnSync("bash", ["-c", '[[ "$1" =~ $2 ]]', "bash", version, versionRegex])
      .status === 0;

  for (const version of ["v0.0.0", "v2.0.0-alpha.0", "v1.2.3-rc.1"]) {
    assert.equal(matches(version), true, `${version} should be accepted`);
  }
  for (const version of ["2.0.0", "v01.0.0", "v1.0.0-01", "v1.0.0+build.1"]) {
    assert.equal(matches(version), false, `${version} should be rejected`);
  }
});
