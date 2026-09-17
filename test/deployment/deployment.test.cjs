"use strict";

const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const { mergeConfig } = require("../../scripts/start-preview-server.cjs");

test("production Dockerfiles use Node 24 and terriajs-server v5 entrypoint", () => {
  for (const file of ["Dockerfile", "deploy/docker/Dockerfile"]) {
    const dockerfile = read(file);
    assert.match(dockerfile, /FROM node:24-bookworm-slim/);
    assert.match(
      dockerfile,
      /ENTRYPOINT \["node", "scripts\/start-preview-server\.cjs"\]/
    );
    assert.doesNotMatch(dockerfile, /node:(?:6|10)\b/);
    assert.doesNotMatch(dockerfile, /terriajs-server\/lib\/app\.js/);
  }

  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.dependencies["terriajs-server"], "5.0.0");
  assert.equal(pkg.engines.node, ">= 22");
});

test("runtime client overrides merge without removing image defaults", () => {
  const merged = mergeConfig(
    {
      initializationUrls: ["simple"],
      parameters: {
        appName: "MAGDA Preview Map",
        parentMessageAllowedOrigins: []
      }
    },
    {
      parameters: {
        parentMessageAllowedOrigins: ["http://localhost:6108"]
      }
    }
  );

  assert.deepEqual(merged, {
    initializationUrls: ["simple"],
    parameters: {
      appName: "MAGDA Preview Map",
      parentMessageAllowedOrigins: ["http://localhost:6108"]
    }
  });
});

test("default Helm chart preserves port, proxy and rollout behavior", () => {
  const rendered = execFileSync(
    "helm",
    ["template", "preview", "deploy/helm/magda-preview-map"],
    { cwd: root, encoding: "utf8" }
  );

  assert.match(rendered, /port: 6110/);
  assert.match(rendered, /targetPort: 6110/);
  assert.match(rendered, /containerPort: 6110/);
  assert.match(rendered, /allowProxyFor/);
  assert.match(rendered, /checksum\/serverConfig:/);
  assert.match(rendered, /checksum\/clientConfig:/);
  assert.match(rendered, /parentMessageAllowedOrigins/);
});

test("Helm renders parent origins, custom port and image overrides", () => {
  const rendered = execFileSync(
    "helm",
    [
      "template",
      "preview",
      "deploy/helm/magda-preview-map",
      "--set",
      "serverConfig.port=6222",
      "--set",
      "clientConfig.parentMessageAllowedOrigins[0]=http://localhost:6108",
      "--set",
      "image.repository=registry.example.test/team",
      "--set",
      "image.name=custom-preview",
      "--set",
      "image.tag=test-tag"
    ],
    { cwd: root, encoding: "utf8" }
  );

  assert.match(
    rendered,
    /parentMessageAllowedOrigins(?:\\u0026quot;|\\?\")?:?\s*\[\\?"http:\/\/localhost:6108/
  );
  assert.match(rendered, /port: 6222/);
  assert.match(rendered, /targetPort: 6222/);
  assert.match(rendered, /containerPort: 6222/);
  assert.match(
    rendered,
    /image: "registry\.example\.test\/team\/custom-preview:test-tag"/
  );
});

test("version utility updates package and Helm chart together", () => {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "magda-preview-version-")
  );
  try {
    fs.mkdirSync(path.join(temporaryRoot, "scripts"));
    fs.mkdirSync(
      path.join(temporaryRoot, "deploy", "helm", "magda-preview-map"),
      { recursive: true }
    );
    fs.copyFileSync(
      path.join(root, "scripts", "set-version.cjs"),
      path.join(temporaryRoot, "scripts", "set-version.cjs")
    );
    fs.writeFileSync(
      path.join(temporaryRoot, "package.json"),
      '{"name":"fixture","version":"1.0.0"}\n'
    );
    fs.writeFileSync(
      path.join(
        temporaryRoot,
        "deploy",
        "helm",
        "magda-preview-map",
        "Chart.yaml"
      ),
      "apiVersion: v2\nname: fixture\nversion: 1.0.0\n"
    );

    for (const invalidVersion of [
      "2.0.0-alpha.1",
      "v1.0.0-01",
      "v1.0.0+build.1"
    ]) {
      const result = spawnSync(
        process.execPath,
        [
          path.join(temporaryRoot, "scripts", "set-version.cjs"),
          invalidVersion
        ],
        { encoding: "utf8" }
      );
      assert.notEqual(result.status, 0, `${invalidVersion} should be rejected`);
      assert.match(
        result.stderr,
        /Expected publishable semantic version with a leading v/
      );
    }
    assert.equal(
      JSON.parse(
        fs.readFileSync(path.join(temporaryRoot, "package.json"), "utf8")
      ).version,
      "1.0.0"
    );
    assert.match(
      fs.readFileSync(
        path.join(
          temporaryRoot,
          "deploy",
          "helm",
          "magda-preview-map",
          "Chart.yaml"
        ),
        "utf8"
      ),
      /^version: 1\.0\.0$/m
    );

    execFileSync(process.execPath, [
      path.join(temporaryRoot, "scripts", "set-version.cjs"),
      "v2.0.0-alpha.1"
    ]);

    assert.equal(
      JSON.parse(
        fs.readFileSync(path.join(temporaryRoot, "package.json"), "utf8")
      ).version,
      "2.0.0-alpha.1"
    );
    assert.match(
      fs.readFileSync(
        path.join(
          temporaryRoot,
          "deploy",
          "helm",
          "magda-preview-map",
          "Chart.yaml"
        ),
        "utf8"
      ),
      /^version: 2\.0\.0-alpha\.1$/m
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("index template stays prefix-safe: no absolute <base> unless configured", () => {
  // html-webpack-plugin renders wwwroot/index.ejs with lodash templating.
  const render = require("lodash/template")(read("wwwroot/index.ejs"));

  // Default build (empty baseHref) must emit NO <base> tag, so the relative
  // build/ asset URLs resolve against the serving path. An absolute
  // <base href="/"> would send assets to the origin root and the client would
  // fail to boot when served under a path prefix such as Magda's gateway
  // (/preview-map/) — the TerriaJS 8 upgrade's default regressed exactly this.
  assert.doesNotMatch(render({ baseHref: "" }), /<base\b/);

  // An explicit baseHref is still honoured for deployments that want one.
  assert.match(
    render({ baseHref: "/preview-map/" }),
    /<base href="\/preview-map\/"\s*\/>/
  );
});
