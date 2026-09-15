"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const appPort = 6131;
const fixturePort = 6132;

async function waitForExit(child, timeoutMilliseconds = 5000) {
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for process exit")),
      timeoutMilliseconds
    );
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
}

async function waitFor(url, child) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`terriajs-server exited with ${child.exitCode}`);
    }
    try {
      await fetch(url);
      return;
    } catch {
      // The process may still be binding its port.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

test("terriajs-server v5 follows redirects and remains healthy", async (t) => {
  const fixture = http.createServer((request, response) => {
    if (request.url === "/redirect") {
      response.writeHead(302, { Location: "/final" });
      response.end();
    } else if (request.url === "/redirect-without-location") {
      response.writeHead(302);
      response.end();
    } else if (request.url === "/final") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end('{"redirected":true}');
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve) =>
    fixture.listen(fixturePort, "127.0.0.1", resolve)
  );
  t.after(() => fixture.close());

  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "magda-preview-server-")
  );
  const configPath = path.join(temporaryDirectory, "serverconfig.json");
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      port: appPort,
      allowProxyFor: ["127.0.0.1"],
      blacklistedAddresses: []
    })
  );
  t.after(() =>
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  );

  const child = spawn(
    process.execPath,
    [
      "node_modules/terriajs-server/terriajs-server.js",
      "--config-file",
      configPath
    ],
    { cwd: root, stdio: "pipe" }
  );
  let output = "";
  child.stdout.on("data", (data) => (output += data));
  child.stderr.on("data", (data) => (output += data));
  t.after(() => {
    if (child.exitCode === null) child.kill("SIGTERM");
  });

  await waitFor(`http://127.0.0.1:${appPort}/`, child);

  const redirected = await fetch(
    `http://127.0.0.1:${appPort}/proxy/_0d/http://127.0.0.1:${fixturePort}/redirect`
  );
  assert.equal(redirected.status, 200, output);
  assert.deepEqual(await redirected.json(), { redirected: true });

  const malformedRedirect = await fetch(
    `http://127.0.0.1:${appPort}/proxy/_0d/http://127.0.0.1:${fixturePort}/redirect-without-location`
  );
  assert.ok(malformedRedirect.status >= 300, output);
  assert.equal(child.exitCode, null, output);

  const health = await fetch(
    `http://127.0.0.1:${appPort}/proxy/_0d/http://127.0.0.1:${fixturePort}/final`
  );
  assert.equal(health.status, 200, output);
});

test("production wrapper exits promptly after SIGTERM", async (t) => {
  const port = 6133;
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "magda-preview-signals-")
  );
  const configPath = path.join(temporaryDirectory, "serverconfig.json");
  fs.writeFileSync(
    configPath,
    JSON.stringify({ port, allowProxyFor: ["example.com"] })
  );
  t.after(() =>
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  );

  const wrapper = spawn(
    process.execPath,
    ["scripts/start-preview-server.cjs"],
    {
      cwd: root,
      detached: true,
      env: { ...process.env, SERVER_CONFIG_PATH: configPath },
      stdio: "pipe"
    }
  );
  let output = "";
  wrapper.stdout.on("data", (data) => (output += data));
  wrapper.stderr.on("data", (data) => (output += data));
  t.after(() => {
    if (wrapper.exitCode === null) {
      try {
        process.kill(-wrapper.pid, "SIGKILL");
      } catch {
        // The wrapper and its process group have already exited.
      }
    }
  });

  await waitFor(`http://127.0.0.1:${port}/`, wrapper);
  const exitPromise = waitForExit(wrapper);
  wrapper.kill("SIGTERM");
  const exit = await exitPromise;

  assert.deepEqual(exit, { code: 143, signal: null }, output);
});
