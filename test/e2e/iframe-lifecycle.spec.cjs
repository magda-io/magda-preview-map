"use strict";

const { expect, test } = require("@playwright/test");

const previewOrigin = "http://127.0.0.1:3001";
const fixtureOrigin = "http://127.0.0.1:3101";

function startData(distributionId, name) {
  return {
    initSources: [
      {
        catalog: [
          {
            type: "magda-item",
            name,
            url: `${fixtureOrigin}/`,
            storageApiUrl: `${fixtureOrigin}/storage/`,
            distributionId,
            defaultBucket: "magda-datasets",
            isEnabled: true,
            zoomOnEnable: true
          }
        ],
        baseMapName: "Positron (Light)",
        corsDomains: ["127.0.0.1"]
      }
    ]
  };
}

test("unchanged same-origin parent reaches success and error terminal states", async ({
  page
}) => {
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto(previewOrigin);
  await page.evaluate(
    ({ previewOrigin, startData }) => {
      const html = `<!doctype html>
        <title>Magda parent lifecycle harness</title>
        <pre id="log">boot</pre>
        <iframe id="preview" src="${previewOrigin}/#mode=preview&hideExplorerPanel=1"></iframe>
        <script>
          const frame = document.querySelector("#preview");
          const log = document.querySelector("#log");
          const startData = ${JSON.stringify(startData)};
          window.addEventListener("message", event => {
            if (event.source !== frame.contentWindow) return;
            log.textContent += "\\n" + event.data;
            if (event.data === "ready") {
              frame.contentWindow.postMessage(startData, "*");
            }
          });
        <\/script>`;
      location.href = URL.createObjectURL(
        new Blob([html], { type: "text/html" })
      );
    },
    {
      previewOrigin,
      startData: startData("success", "Lifecycle success fixture")
    }
  );

  const log = page.locator("#log");
  await expect(log).toContainText("ready");
  await expect(log).toContainText("loading complete");
  expect((await log.textContent()).match(/loading complete/g)).toHaveLength(1);
  await expect
    .poll(() => requests.some((url) => url.includes("tile.openstreetmap.org")))
    .toBe(true);
  expect(
    requests.some((url) =>
      /cartocdn|cartodb-basemaps|global\.ssl\.fastly\.net/i.test(url)
    )
  ).toBe(false);

  await page.evaluate(
    (emptyStartData) => {
      document
        .querySelector("#preview")
        .contentWindow.postMessage(emptyStartData, "*");
    },
    startData("empty", "Empty GeoJSON fixture")
  );
  await expect
    .poll(async () => (await log.textContent()).match(/loading complete/g))
    .toHaveLength(2);
  expect(requests.some((url) => url.endsWith("/empty.geojson"))).toBe(true);

  await page.evaluate(
    (storageStartData) => {
      document
        .querySelector("#preview")
        .contentWindow.postMessage(storageStartData, "*");
    },
    startData("storage", "Storage API GeoJSON fixture")
  );
  await expect
    .poll(async () => (await log.textContent()).match(/loading complete/g))
    .toHaveLength(3);
  expect(
    requests.some((url) =>
      url.endsWith("/storage/magda-datasets/storage.geojson")
    )
  ).toBe(true);

  await page.evaluate(
    (failureStartData) => {
      document
        .querySelector("#preview")
        .contentWindow.postMessage(failureStartData, "*");
    },
    startData("failure", "Lifecycle failure fixture")
  );

  await expect(log).toContainText('"type":"error"');
  const terminalError = JSON.parse(
    (await log.textContent())
      .split("\n")
      .find((line) => line.startsWith('{"type":"error"'))
  );
  expect(terminalError.type).toBe("error");
  expect(terminalError.title).toBeTruthy();
  expect(terminalError.message).toBeTruthy();
});

test("unconfigured cross-origin parent cannot start a preview load", async ({
  page
}) => {
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto(`${fixtureOrigin}/parent`);
  await expect(page.locator("#log")).toContainText("iframe loaded");

  const previewFrame = page
    .frames()
    .find((frame) => frame.url().startsWith(`${previewOrigin}/`));
  expect(previewFrame).toBeTruthy();

  // The title changes in Terria's completed startup callback immediately before
  // configureMagdaPreviewLifecycle runs. Once the browser yields after this
  // change, the lifecycle message listener is active.
  await expect.poll(() => previewFrame.title()).toBe("MAGDA Preview Map");

  // Repeated attempts over a bounded interval ensure this cannot pass because a
  // single message happened to arrive before asynchronous Terria startup.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.evaluate(() => window.postRejectedStart());
    await page.waitForTimeout(100);
  }
  expect(await page.evaluate(() => window.rejectedStartAttempts)).toBe(20);
  await page.waitForTimeout(500);

  await expect(page.locator("#log")).toHaveText("boot\niframe loaded");
  expect(requests.some((url) => url.includes("cross-rejected"))).toBe(false);
});
