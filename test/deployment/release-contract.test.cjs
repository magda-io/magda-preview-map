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

test("release workflow publishes only the canonical GHCR and OCI artifacts", () => {
  const workflow = read(".github/workflows/release.yml");

  assert.match(
    workflow,
    /ghcr\.io\/magda-io\/magda-preview-map:\$\{\{ github\.sha \}\}/
  );
  assert.match(
    workflow,
    /ghcr\.io\/magda-io\/magda-preview-map:\$\{\{ steps\.release-version\.outputs\.version \}\}/
  );
  assert.match(workflow, /platforms: linux\/amd64,linux\/arm64/);
  assert.match(workflow, /docker\/setup-qemu-action@v3/);
  assert.match(workflow, /helm push[^\n]+oci:\/\/ghcr\.io\/magda-io\/charts/);
  assert.doesNotMatch(
    workflow,
    /docker\.io|Docker Hub|S3_BUCKET|aws-actions|aws s3/
  );
});

test("release workflow validates its tag against package and chart versions", () => {
  const workflow = read(".github/workflows/release.yml");

  assert.match(workflow, /SEMVER_REGEX="\^v/);
  assert.match(workflow, /PACKAGE_VERSION=.*package\.json/);
  assert.match(workflow, /CHART_VERSION=.*Chart\.yaml/);
  assert.match(workflow, /RELEASE_TAG.*v\$\{PACKAGE_VERSION\}/);
  assert.match(workflow, /RELEASE_TAG.*v\$\{CHART_VERSION\}/);
});

test("set-version workflow requires tagged semver and regenerates Helm docs", () => {
  const workflow = read(".github/workflows/set-version.yaml");

  assert.match(workflow, /SEMVER_REGEX="\^v/);
  assert.match(workflow, /yarn set-version "\$SELECTED_VERSION"/);
  assert.match(workflow, /yarn helm-docs/);
  assert.match(workflow, /git add package\.json[^\n]+Chart\.yaml README\.md/);
});

test("main CI runs characterization once and checks generated Helm docs", () => {
  const workflow = read(".github/workflows/main.yml");
  const packageJson = JSON.parse(read("package.json"));

  assert.doesNotMatch(workflow, /compatibility-contract|test:characterization/);
  assert.match(workflow, /yarn test/);
  assert.match(
    packageJson.scripts.test,
    /test\/characterization\/\*\.test\.cjs/
  );
  assert.match(workflow, /yarn helm-docs/);
  assert.match(workflow, /git diff --exit-code -- README\.md/);
  assert.match(workflow, /platforms: linux\/amd64,linux\/arm64/);
});

test("package, chart, and generated README versions stay aligned", () => {
  const packageVersion = JSON.parse(read("package.json")).version;
  const chartVersion = read("deploy/helm/magda-preview-map/Chart.yaml").match(
    /^version: (.+)$/m
  )[1];
  const readme = read("README.md");

  assert.equal(chartVersion, packageVersion);
  assert.ok(readme.includes(`Version-${packageVersion}-informational`));
});
