"use strict";

const { expect, test } = require("@playwright/test");

const previewOrigin = "http://127.0.0.1:3001";
const fixtureOrigin = "http://127.0.0.1:3101";

const openerStartData = {
  initSources: [
    {
      catalog: [
        {
          type: "magda-item",
          name: "Opened dataset",
          url: `${fixtureOrigin}/`,
          storageApiUrl: `${fixtureOrigin}/storage/`,
          distributionId: "success",
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

function isCatalogListRequest(url) {
  const parsed = new URL(url);
  return (
    parsed.origin === fixtureOrigin &&
    parsed.pathname === "/api/v0/registry/records"
  );
}

// #53 + #55: a same-origin opener launches the full map ("Open full map"),
// sends the unchanged magda-item start data, and the full map exposes a lazy
// Magda catalog from which a second dataset can be added.
test("full map opened by the Magda web client browses the lazy Magda catalog", async ({
  context,
  page
}) => {
  const requests = [];
  context.on("request", (request) => requests.push(request.url()));

  // A blob page created by the preview origin shares that origin, like the
  // Magda web client and /preview-map/ behind the Magda gateway.
  await page.goto(previewOrigin);
  await page.evaluate(
    ({ previewOrigin, startData }) => {
      const html = `<!doctype html>
        <title>Magda opener harness</title>
        <button id="open-full-map">Open full map</button>
        <pre id="log">boot</pre>
        <script>
          const log = document.querySelector("#log");
          let fullMap;
          document.querySelector("#open-full-map").onclick = () => {
            fullMap = window.open("${previewOrigin}/", "_blank");
          };
          window.addEventListener("message", event => {
            if (!fullMap || event.source !== fullMap) return;
            log.textContent += "\\n" + event.data;
            if (event.data === "ready" && event.origin === "${previewOrigin}") {
              fullMap.postMessage(${JSON.stringify(startData)}, "${previewOrigin}");
            }
          });
        <\/script>`;
      location.href = URL.createObjectURL(
        new Blob([html], { type: "text/html" })
      );
    },
    { previewOrigin, startData: openerStartData }
  );

  const [fullMap] = await Promise.all([
    page.waitForEvent("popup"),
    page.locator("#open-full-map").click()
  ]);
  const log = page.locator("#log");
  await expect(log).toContainText("ready");
  await expect(log).toContainText("loading complete");

  // The original dataset is on the workbench; nothing is listed yet.
  await expect(fullMap.getByText("Opened dataset").first()).toBeVisible();
  expect(requests.some(isCatalogListRequest)).toBe(false);

  // Opening the Explorer shows the catalog root, still without listing.
  await fullMap.getByRole("button", { name: /Explore data/i }).click();
  const catalogRoot = fullMap.getByRole("button", {
    name: /Magda data catalog/
  });
  await expect(catalogRoot).toBeVisible();
  expect(requests.some(isCatalogListRequest)).toBe(false);

  // Expanding it loads exactly one bounded Registry page.
  await catalogRoot.click();
  await expect(
    fullMap.getByRole("button", { name: /Catalog GeoJSON dataset/ })
  ).toBeVisible();
  await expect(
    fullMap.getByRole("button", { name: /Catalog PDF-only dataset/ })
  ).toBeVisible();
  const moreDatasets = fullMap.getByRole("button", { name: /More datasets/ });
  await expect(moreDatasets).toBeVisible();

  const listRequests = requests
    .filter(isCatalogListRequest)
    .map((url) => new URL(url));
  expect(listRequests).toHaveLength(1);
  expect(listRequests[0].searchParams.get("aspect")).toBe(
    "dcat-dataset-strings"
  );
  expect(listRequests[0].searchParams.get("limit")).toBe("50");
  expect(listRequests[0].searchParams.has("pageToken")).toBe(false);
  // Listing does not dereference any dataset's distributions.
  expect(
    requests.some((url) => url.includes("/api/v0/registry/records/catalog-"))
  ).toBe(false);

  // Continuation loads the next page with the Registry token.
  await moreDatasets.click();
  await expect(
    fullMap.getByRole("button", { name: /Catalog second page dataset/ })
  ).toBeVisible();
  const pageTwo = requests
    .filter(isCatalogListRequest)
    .map((url) => new URL(url))
    .find((url) => url.searchParams.get("pageToken") === "page-2");
  expect(pageTwo).toBeTruthy();

  // Add a second dataset through the existing magda-item resolution path.
  // (Terria closes the Explorer after "Add to the map".)
  await fullMap
    .getByRole("button", { name: /Catalog GeoJSON dataset/ })
    .click();
  await fullMap
    .getByRole("button", { name: /Add to the map/i })
    .first()
    .click();
  await expect
    .poll(() => requests.some((url) => url.endsWith("/catalog.geojson")))
    .toBe(true);
  expect(
    requests.some((url) =>
      url.includes("/api/v0/registry/records/catalog-ds-1?")
    )
  ).toBe(true);

  // Both datasets are on the workbench together.
  await expect(fullMap.getByText(/^Datasets \(2\)$/i)).toBeVisible();
  await expect(fullMap.getByText("Opened dataset").first()).toBeVisible();
  await expect(
    fullMap.getByText("Catalog GeoJSON dataset").first()
  ).toBeVisible();
});
