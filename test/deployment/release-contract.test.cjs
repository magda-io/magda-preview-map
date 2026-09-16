"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
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

test("release workflow preserves canonical GHCR and OCI targets", () => {
  const workflow = read(".github/workflows/release.yml");

  assert.match(workflow, /^\s+ghcr\.io\/magda-io\/magda-preview-map$/m);
  assert.match(workflow, /helm push[^\n]+oci:\/\/ghcr\.io\/magda-io\/charts/);
});

test("Docker Hub and S3 remain additional compatibility targets", () => {
  const workflow = read(".github/workflows/release.yml");

  assert.match(workflow, /^\s+docker\.io\/data61\/magda-preview-map$/m);
  assert.match(workflow, /additional S3 compatibility repository/);
  assert.match(workflow, /aws s3 sync[^\n]+s3:\/\/\$\{S3_BUCKET\}\//);
});
