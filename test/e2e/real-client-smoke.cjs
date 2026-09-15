"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const clientOrigin =
  process.env.MAGDA_WEB_CLIENT_URL || "http://127.0.0.1:3000";
const previewOrigin = process.env.PREVIEW_MAP_URL || "http://127.0.0.1:3001";
const outputPath = path.resolve(
  process.env.REAL_CLIENT_RESULTS ||
    "test-results/real-client-smoke-results.json"
);

const caseFilter = new Set(
  (process.env.REAL_CLIENT_CASES || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

const cases = [
  {
    id: "wms-selection",
    datasetId: "ds-aodn-2d703245-654e-4964-a52d-396d28b20c97",
    distributionId: "dist-aodn-2d703245-654e-4964-a52d-396d28b20c97-0",
    select: "Geophysical Survey Datasets - Gravity",
    request:
      /(?=.*request=GetMap)(?=.*layers=gadds(?:%3A|:)geophysical_datasets_gravity)/i
  },
  {
    id: "wfs-selection",
    datasetId: "ds-aodn-b249b01e-1f8c-4cd2-bb79-d374b4884c9f",
    distributionId: "dist-aodn-b249b01e-1f8c-4cd2-bb79-d374b4884c9f-0",
    select: "Geophysical Survey Datasets - Gravity",
    request:
      /(?=.*request=GetFeature)(?=.*typeName=gadds(?:%3A|:)geophysical_datasets_gravity)(?=.*maxFeatures=1000)/i
  },
  {
    id: "esri-mapserver",
    datasetId: "ds-wa-943ae035-ab6d-4dec-85e7-a11aec1c8960",
    distributionId: "dist-wa-898b2c19-cfa2-4137-a822-c60fe847ce9e",
    request: /Industry_and_Mining\/MapServer\/export/i,
    featurePick: /Industry_and_Mining\/MapServer\/identify/i
  },
  {
    id: "esri-featureserver-root",
    datasetId: "ds-nsw-a850719c-a7ae-4c91-9608-9529eee29d2b",
    distributionId: "dist-nsw-a19ca375-ef6d-47db-852f-ade163522c15",
    request: /NSW_Dedicated_Timber_Reserves\/FeatureServer\/0\/query/i
  },
  {
    id: "esri-featureserver-layer",
    datasetId: "ds-vic-ba7db898-4fb1-4d6d-9ece-38b39f61cbfb",
    distributionId: "dist-vic-ef24d764-fcee-410b-94ec-ea136096c223",
    request: /FeatureServer\/1\?f=json/i
  },
  {
    id: "geojson",
    datasetId: "ds-nsw-94ef50bf-5372-4407-8e48-e197abbdc1d5",
    distributionId: "dist-nsw-5eafdf75-3a2e-4b3f-be2b-aa6b114469c3",
    request: /offstreetparkingdata_2\.geojson/i,
    proxyFixture: "test/e2e/fixtures/points.geojson",
    proxyContentType: "application/geo+json"
  },
  {
    id: "csv-geo-au",
    datasetId: "ds-dga-3a94098e-efde-424c-9e46-04ea0833c4ce",
    distributionId: "dist-dga-61916b2d-82c2-4d7d-86d7-391f6e751303",
    request: /corangamite-shire-bins\.csv/i,
    proxyFixture: "test/e2e/fixtures/points.csv"
  },
  {
    id: "kml",
    datasetId: "ds-nsw-0d915408-0026-44f7-a477-5f29ad7708ea",
    distributionId: "dist-nsw-f3415b5d-efbb-4749-a108-eeb31e2bb1d1",
    request: /2016012517-30-21\.kml/i
  },
  {
    id: "kmz",
    datasetId: "ds-sa-e05b4646-3160-47c9-a9b7-817bd31b91fd",
    distributionId: "dist-sa-8ecd516d-b7af-420c-b352-7df12827af58",
    request: /Litter(?:\+|%20)Bins-Point\.kmz/i
  },
  {
    id: "remote-wfs-error",
    datasetId: "ds-wa-943ae035-ab6d-4dec-85e7-a11aec1c8960",
    distributionId: "dist-wa-cb7836bf-376a-4ace-9cb5-258b223b1cd1",
    expectError: true
  }
].filter(({ id }) => caseFilter.size === 0 || caseFilter.has(id));

function routeFor(testCase) {
  return `${clientOrigin}/dataset/${testCase.datasetId}/distribution/${testCase.distributionId}/details`;
}

async function waitForSuccess(page) {
  const iframe = page.locator(".data-preview-map iframe");
  await iframe.waitFor({ state: "attached", timeout: 120_000 });
  await iframe.scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () => {
      const frame = document.querySelector(".data-preview-map iframe");
      return (
        document.body.innerText.includes("Map Preview Experienced an Error:") ||
        (frame && !frame.className.includes("_loading"))
      );
    },
    undefined,
    { timeout: 120_000 }
  );
  if (await page.getByText("Map Preview Experienced an Error:").count()) {
    throw new Error("Magda parent displayed a terminal preview error");
  }
  const source = await iframe.getAttribute("src");
  if (!source?.startsWith(`${previewOrigin}/`)) {
    throw new Error(`Expected candidate iframe, received ${source}`);
  }
}

async function selectMember(page, testCase) {
  const dataRequest = page.waitForRequest(
    (request) => testCase.request.test(request.url()),
    { timeout: 120_000 }
  );
  const member = page.getByRole("combobox").last();
  await member.click();
  await page
    .getByRole("option", { name: testCase.select, exact: true })
    .click();
  await dataRequest;
  await waitForSuccess(page);
}

async function pickFeature(page, testCase, requests) {
  await page.locator(".data-preview-map").click({ position: { x: 10, y: 10 } });
  const frame = page
    .frames()
    .find((candidate) => candidate.url().startsWith(`${previewOrigin}/`));
  if (!frame) throw new Error("Candidate iframe frame not found");
  const canvas = frame.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Map canvas is not visible");

  for (const position of [0.5, 0.45, 0.55]) {
    await canvas.click({
      position: { x: box.width * position, y: box.height / 2 },
      force: true
    });
    await page.waitForTimeout(750);
  }
  if (!requests.some((url) => testCase.featurePick.test(url))) {
    throw new Error("No feature-info request observed after map clicks");
  }
}

async function runCase(browser, testCase) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1400 }
  });
  const requests = [];
  const responses = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("response", (response) =>
    responses.push({ status: response.status(), url: response.url() })
  );
  if (testCase.proxyFixture) {
    const fixtureBody = await fs.readFile(path.resolve(testCase.proxyFixture));
    await page.route("**/proxy/**", async (route) => {
      if (!testCase.request.test(route.request().url())) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: testCase.proxyContentType || "text/csv; charset=utf-8",
        body: fixtureBody
      });
    });
  }

  const started = Date.now();
  try {
    await page.goto(routeFor(testCase), {
      waitUntil: "domcontentloaded",
      timeout: 120_000
    });
    await page
      .getByRole("heading", { name: "Map Preview", exact: true })
      .waitFor({
        timeout: 120_000
      });

    if (testCase.expectError) {
      const iframe = page.locator(".data-preview-map iframe");
      await iframe.waitFor({ state: "attached", timeout: 120_000 });
      await iframe.scrollIntoViewIfNeeded();
      const source = await iframe.getAttribute("src");
      if (!source?.startsWith(`${previewOrigin}/`)) {
        throw new Error(`Expected candidate iframe, received ${source}`);
      }
      await page
        .getByText("Map Preview Experienced an Error:")
        .waitFor({ timeout: 120_000 });
      return {
        id: testCase.id,
        outcome: "expected-error",
        elapsedMs: Date.now() - started,
        candidateIframe: true,
        failedResponses: responses.filter(({ status }) => status >= 400)
      };
    }

    await waitForSuccess(page);
    if (testCase.select) {
      await selectMember(page, testCase);
    } else if (
      testCase.request &&
      !requests.some((url) => testCase.request.test(url))
    ) {
      await page.waitForResponse(
        (response) => testCase.request.test(response.url()),
        { timeout: 60_000 }
      );
    }
    if (testCase.featurePick) {
      await pickFeature(page, testCase, requests);
    }

    const relevant = responses.filter(
      ({ url }) =>
        testCase.request?.test(url) || testCase.featurePick?.test(url)
    );
    return {
      id: testCase.id,
      outcome: "success",
      elapsedMs: Date.now() - started,
      candidateIframe: true,
      proxyFixture: testCase.proxyFixture,
      relevantResponses: relevant,
      openStreetMap: requests.some((url) =>
        url.includes("tile.openstreetmap.org")
      ),
      carto: requests.some((url) =>
        /cartocdn|cartodb-basemaps|global\.ssl\.fastly\.net/i.test(url)
      )
    };
  } catch (error) {
    return {
      id: testCase.id,
      outcome: "failure",
      elapsedMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
      failedResponses: responses.filter(({ status }) => status >= 400)
    };
  } finally {
    await page.close();
  }
}

async function main() {
  if (cases.length === 0) {
    throw new Error("REAL_CLIENT_CASES did not match any acceptance case");
  }
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const testCase of cases) {
      const result = await runCase(browser, testCase);
      results.push(result);
      console.log(`${result.id}: ${result.outcome} (${result.elapsedMs}ms)`);
    }
  } finally {
    await browser.close();
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        clientOrigin,
        previewOrigin,
        results
      },
      null,
      2
    )}\n`
  );
  if (results.some(({ outcome }) => outcome === "failure"))
    process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
