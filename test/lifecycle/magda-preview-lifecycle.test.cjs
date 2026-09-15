"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const swc = require("@swc/core");

const root = path.resolve(__dirname, "../..");

function compile(file, localRequire = require) {
  const source = fs.readFileSync(file, "utf8");
  const { code } = swc.transformSync(source, {
    filename: file,
    jsc: { parser: { syntax: "typescript" }, target: "es2022" },
    module: { type: "commonjs" }
  });
  const loaded = { exports: {} };
  Function("module", "exports", "require", code)(
    loaded,
    loaded.exports,
    localRequire
  );
  return loaded.exports;
}

const compatibility = compile(
  path.join(root, "lib/Models/magdaPreviewCompatibility.ts")
);
const lifecycle = compile(
  path.join(root, "lib/Models/MagdaPreviewLifecycle.ts"),
  (request) => {
    if (request === "./magdaPreviewCompatibility") return compatibility;
    if (request === "terriajs/lib/Core/TerriaError") {
      return { TerriaErrorSeverity: { Error: 0, Warning: 1 } };
    }
    return require(request);
  }
);

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function harness({ allowedOrigins = [], update } = {}) {
  const messages = [];
  const parent = {
    postMessage(data, targetOrigin) {
      messages.push({ data, targetOrigin });
    }
  };
  let listener;
  const previewWindow = {
    location: { origin: "https://preview.example.test" },
    parent,
    opener: null,
    addEventListener(type, callback) {
      assert.equal(type, "message");
      listener = callback;
    }
  };
  const terria = {
    configParameters: { parentMessageAllowedOrigins: allowedOrigins },
    updateFromStartData: update || (async () => result()),
    raiseErrorToUser() {}
  };
  lifecycle.default(terria, previewWindow);
  messages.length = 0;
  return { terria, previewWindow, parent, messages, dispatch: listener };
}

function result(error) {
  return { error, raiseError() {} };
}

function magdaStartData(name = "Preview item") {
  return {
    initSources: [
      {
        catalog: [
          {
            type: "magda-item",
            name,
            distributionId: "distribution-id",
            isEnabled: true
          }
        ]
      }
    ]
  };
}

test("detects the unchanged Magda catalog payload without matching unrelated data", () => {
  assert.equal(lifecycle.containsMagdaPreviewItem(magdaStartData()), true);
  assert.equal(
    lifecycle.containsMagdaPreviewItem({ initSources: [{ catalog: [] }] }),
    false
  );
});

test("allows same-origin and explicitly configured parents without wildcard trust", () => {
  const origins = lifecycle.parentMessageAllowedOrigins(
    {
      configParameters: {
        parentMessageAllowedOrigins: [
          "https://catalog.example.test",
          "*",
          "null",
          "https://catalog.example.test/path",
          "https://catalog.example.test"
        ]
      }
    },
    { location: { origin: "https://preview.example.test" } }
  );

  assert.deepEqual(origins, [
    "https://preview.example.test",
    "https://catalog.example.test"
  ]);
});

test("ready uses explicit allowed origins", () => {
  const messages = [];
  const parent = {
    postMessage(data, targetOrigin) {
      messages.push({ data, targetOrigin });
    }
  };
  const previewWindow = {
    location: { origin: "https://preview.example.test" },
    parent,
    opener: null,
    addEventListener() {}
  };
  const terria = {
    configParameters: {
      parentMessageAllowedOrigins: ["https://catalog.example.test"]
    }
  };

  lifecycle.default(terria, previewWindow);
  assert.deepEqual(messages, [
    { data: "ready", targetOrigin: "https://preview.example.test" },
    { data: "ready", targetOrigin: "https://catalog.example.test" }
  ]);
});

test("rejects unconfigured origins and unrelated windows", async () => {
  let updates = 0;
  const h = harness({
    allowedOrigins: ["https://catalog.example.test"],
    update: async () => {
      updates += 1;
      return result();
    }
  });

  await h.dispatch({
    origin: "https://unconfigured.example.test",
    source: h.parent,
    data: magdaStartData()
  });
  await h.dispatch({
    origin: "https://catalog.example.test",
    source: {},
    data: magdaStartData()
  });
  await h.dispatch({
    origin: "https://preview.example.test",
    source: null,
    data: magdaStartData()
  });

  assert.equal(updates, 0);
  assert.deepEqual(h.messages, []);
});

test("completion waits for the selected workbench item and is emitted once", async () => {
  const update = deferred();
  const h = harness({ update: () => update.promise });
  const processing = h.dispatch({
    origin: "https://preview.example.test",
    source: h.parent,
    data: magdaStartData()
  });
  const generation = lifecycle.beginMagdaPreviewItemLoad(h.terria);
  const secondItemGeneration = lifecycle.beginMagdaPreviewItemLoad(h.terria);

  assert.deepEqual(h.messages, []);
  update.resolve(result());
  await processing;
  await Promise.resolve();
  assert.deepEqual(h.messages, []);

  lifecycle.finishMagdaPreviewItemLoad(h.terria, generation);
  assert.deepEqual(h.messages, []);
  lifecycle.finishMagdaPreviewItemLoad(h.terria, secondItemGeneration);
  lifecycle.finishMagdaPreviewItemLoad(h.terria, secondItemGeneration);
  assert.deepEqual(h.messages, [
    {
      data: "loading complete",
      targetOrigin: "https://preview.example.test"
    }
  ]);
});

test("load errors retain the parent-compatible terminal JSON shape", async () => {
  const h = harness();
  const processing = h.dispatch({
    origin: "https://preview.example.test",
    source: h.parent,
    data: magdaStartData()
  });
  const generation = lifecycle.beginMagdaPreviewItemLoad(h.terria);
  lifecycle.finishMagdaPreviewItemLoad(h.terria, generation, {
    title: "Registry failed",
    message: "registry unavailable"
  });
  await processing;

  assert.equal(h.messages.length, 1);
  assert.deepEqual(JSON.parse(h.messages[0].data), {
    type: "error",
    title: "Registry failed",
    message: "registry unavailable"
  });
});

test("a reused iframe resets state and ignores an older in-flight load", async () => {
  const h = harness();
  const first = h.dispatch({
    origin: "https://preview.example.test",
    source: h.parent,
    data: magdaStartData("First")
  });
  const firstGeneration = lifecycle.beginMagdaPreviewItemLoad(h.terria);
  await first;

  const second = h.dispatch({
    origin: "https://preview.example.test",
    source: h.parent,
    data: magdaStartData("Second")
  });
  const secondGeneration = lifecycle.beginMagdaPreviewItemLoad(h.terria);
  await second;

  lifecycle.finishMagdaPreviewItemLoad(h.terria, firstGeneration);
  assert.deepEqual(h.messages, []);
  lifecycle.finishMagdaPreviewItemLoad(h.terria, secondGeneration);
  assert.equal(h.messages.at(-1).data, "loading complete");
});

test("an already-loaded item still terminates after accepted start data", async () => {
  const h = harness({
    allowedOrigins: ["https://catalog.example.test"]
  });
  await h.dispatch({
    origin: "https://catalog.example.test",
    source: h.parent,
    data: magdaStartData()
  });
  await Promise.resolve();

  assert.equal(h.messages.at(-1).data, "loading complete");
  assert.equal(
    h.messages.at(-1).targetOrigin,
    "https://catalog.example.test"
  );
});
