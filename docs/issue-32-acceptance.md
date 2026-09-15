# Issue #32 acceptance report

This report records the final compatibility, source-preference, basemap, cleanup, and unchanged-client checks for the TerriaMap v0.4.8 / TerriaJS 8.13 upgrade.

## Environment and method

- Preview candidate: production build served at `http://127.0.0.1:3001`.
- Caller: the production build of the unchanged Magda web client checkout at `/Users/t1000/development/magda/magda-web-client`, served at `http://127.0.0.1:3000`.
- Catalog and API: the authenticated `dev` profile at `https://dev.magda.io/api`.
- Browser: headless and interactive Chromium at a desktop viewport.
- Only `previewMapBaseUrl` was overridden. The Magda caller source and payload were not changed.
- The existing Magda checkout contained only its pre-existing untracked `.claude/`, `.env`, and `docs/plans/` paths after testing.
- The unchanged client was built with `DISABLE_ESLINT_PLUGIN=true` because its baseline source has Prettier warnings unrelated to this repository.

Run the repeatable matrix with `yarn test:e2e:real-client`. It writes machine-readable timings and request evidence to `test-results/real-client-smoke-results.json`. Public endpoint latency and availability are variable, so individual cases may be retried with `REAL_CLIENT_CASES=id[,id]`.

## Acceptance matrix

| Case                                  | Dataset / distribution                                                                              | Result and evidence                                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WMS discovery and explicit selection  | `ds-aodn-2d703245-654e-4964-a52d-396d28b20c97` / `dist-aodn-2d703245-654e-4964-a52d-396d28b20c97-0` | Passed. The initial AEM member rendered. Selecting Gravity remounted the iframe, completed a new handshake, and produced `GetMap` requests with `layers=gadds:geophysical_datasets_gravity`.                                                                                                                             |
| WFS discovery and explicit selection  | `ds-aodn-b249b01e-1f8c-4cd2-bb79-d374b4884c9f` / `dist-aodn-b249b01e-1f8c-4cd2-bb79-d374b4884c9f-0` | Passed. The initial member rendered. Selecting Gravity remounted the iframe and produced `GetFeature` requests with `typeName=gadds:geophysical_datasets_gravity` and `maxFeatures=1000`.                                                                                                                                |
| Esri MapServer and feature info       | `ds-wa-943ae035-ab6d-4dec-85e7-a11aec1c8960` / `dist-wa-898b2c19-cfa2-4137-a822-c60fe847ce9e`       | Passed. Native metadata, legend, export, and `identify` requests rendered layer 31. Canvas clicks opened Feature Info with survey attributes.                                                                                                                                                                            |
| Bare Esri FeatureServer root          | `ds-nsw-a850719c-a7ae-4c91-9608-9529eee29d2b` / `dist-nsw-a19ca375-ef6d-47db-852f-ade163522c15`     | Passed. The native group resolved layer 0 and issued viewport-tiled `/FeatureServer/0/query` requests with quantization/PBF parameters. No adapter `tileRequests` override was present.                                                                                                                                  |
| Explicit Esri FeatureServer layer     | `ds-vic-ba7db898-4fb1-4d6d-9ece-38b39f61cbfb` / `dist-vic-ef24d764-fcee-410b-94ec-ea136096c223`     | Passed for loading and rendering. The caller URL ending in `/FeatureServer/1` remained unchanged and Terria chose its native strategy. See the feature-picking follow-up below.                                                                                                                                          |
| GeoJSON                               | `ds-nsw-94ef50bf-5372-4407-8e48-e197abbdc1d5` / `dist-nsw-5eafdf75-3a2e-4b3f-be2b-aa6b114469c3`     | Passed through the unchanged real caller with the catalog record intact and the currently blocked Transport NSW proxy response replaced by the checked-in two-point GeoJSON fixture. The public source is 63,946 bytes but currently returns HTTP 403 through `terriajs-server`.                                         |
| CSV-GEO-AU                            | `ds-dga-3a94098e-efde-424c-9e46-04ea0833c4ce` / `dist-dga-61916b2d-82c2-4d7d-86d7-391f6e751303`     | Passed through the unchanged real caller with the catalog record intact and the currently blocked data.gov.au proxy response replaced by the checked-in two-point CSV fixture. The public source currently returns HTTP 403 through `terriajs-server`, although direct `curl` returns 200.                               |
| KML                                   | `ds-nsw-0d915408-0026-44f7-a477-5f29ad7708ea` / `dist-nsw-f3415b5d-efbb-4749-a108-eeb31e2bb1d1`     | Passed through the real caller; the 234,652-byte KML rendered.                                                                                                                                                                                                                                                           |
| KMZ                                   | `ds-sa-e05b4646-3160-47c9-a9b7-817bd31b91fd` / `dist-sa-8ecd516d-b7af-420c-b352-7df12827af58`       | Passed through the real caller; the 57,706-byte KMZ rendered.                                                                                                                                                                                                                                                            |
| Storage API-backed GeoJSON            | Browser fixture `storage`                                                                           | Passed in the caller-shaped Playwright harness. `magda://storage-api/storage.geojson` was rewritten with the caller's default bucket to `/storage/magda-datasets/storage.geojson`, rendered, and emitted one awaited completion. Unit characterization also covers `defaultBucket ?? datasetBucket ?? "magda-datasets"`. |
| Empty / zero-feature GeoJSON          | Browser fixture `empty`                                                                             | Passed. An empty FeatureCollection loaded without a terminal error and emitted exactly one new `loading complete` message.                                                                                                                                                                                               |
| Terminal source error                 | `ds-wa-943ae035-ab6d-4dec-85e7-a11aec1c8960` / `dist-wa-cb7836bf-376a-4ace-9cb5-258b223b1cd1`       | Passed error handling. The service returns GML 3.1.1 with an unsupported media type; the iframe sent the JSON error and the unchanged parent replaced its spinner with “Map Preview Experienced an Error”.                                                                                                               |
| Basemap compatibility                 | All successful browser cases                                                                        | Passed. The unchanged caller continued requesting `Positron (Light)`. With no licensed replacement configured, OSM tiles loaded and no Carto/Fastly basemap request was observed. Automated lifecycle tests prove that an operator-configured basemap named `Positron (Light)` takes precedence.                         |
| Same-origin / cross-origin lifecycle  | Browser fixtures                                                                                    | Passed. Same-origin parent success, empty, Storage API, and error generations completed once each. An unconfigured cross-origin parent could not start a load.                                                                                                                                                           |
| WMS/WFS no-selection fallback         | Adapter characterization fixtures                                                                   | Passed. Native service groups select their first usable member only when the caller omits its explicit selection.                                                                                                                                                                                                        |
| Historical bounded-WFS regression #18 | `ds-dga-7ded7c00-475a-4c54-aaa6-6b4538eb28ef` / `dist-dga-759053f2-7597-4997-84ff-f722af4ca660`     | The current public endpoint now advertises an empty `FeatureTypeList`, so it correctly terminates in the parent error state rather than hanging. The successful GA WFS case verifies the #18 invariant with `maxFeatures=1000`; unit tests guard the bound.                                                              |
| Preview hash and chrome               | Unchanged real caller and foundation test                                                           | Passed. The iframe uses `#mode=preview&hideExplorerPanel=1`; application chrome is hidden while map navigation remains.                                                                                                                                                                                                  |
| Helm/server/proxy                     | Active Helm chart and Node 24 image                                                                 | Passed. Helm lint/render, proxy redirect health, SIGTERM behavior, production build, and Docker build all completed.                                                                                                                                                                                                     |

The final clean-browser matrix recorded WMS 2.3 s, WFS 3.2 s, MapServer 6.4 s, FeatureServer root 3.7 s, explicit FeatureServer 2.1 s, fixture-backed GeoJSON/CSV 1.3 s each, KML 3.4 s, and KMZ 1.6 s. These include the Magda route, iframe startup, discovery, data load, and terminal handshake; they are observations, not stable benchmarks.

## A/B/C source comparison

Two practical comparisons were made without changing `DEFAULT_DATA_SOURCE_PREFERENCE`.

### Same WA dataset: WMS vs MapServer vs WFS

- WMS (`dist-wa-2257ab78-a3a2-4977-b3b7-01e36272ffd2`) rendered through two capabilities responses, one legend, and eight viewport-map responses: 11 service requests and approximately 184 kB. It preserved authoritative server-side cartography but exposes feature info only where the WMS advertises it.
- MapServer (`dist-wa-898b2c19-cfa2-4137-a822-c60fe847ce9e`) used metadata, legend, layer metadata, and ten viewport exports: 13 service requests and approximately 543 kB. Most transfer was the 429 kB layer metadata response. Feature info was correct through `identify`, but startup was the slowest representative successful case.
- WFS (`dist-wa-cb7836bf-376a-4ace-9cb5-258b223b1cd1`) made three service requests before failing. Its 522-byte `GetFeature` response is `text/xml; subtype=gml/3.1.1`, which TerriaJS 8.13 does not ingest here. No useful feature set rendered; the parent error lifecycle was correct.

For this dataset, order A and B both choose WMS first and therefore have the same successful outcome. Order C chooses MapServer first: it costs more metadata and startup time but provides reliable ArcGIS `identify`. If WMS is unavailable, B is preferable to A on the wider evidence because it tries native FeatureServer before the less consistent WFS path.

### Same GA service family: WMS vs WFS

Both paths discovered the same named survey layers and honored the caller's explicit Gravity selection. WMS retained server styling and was quicker in the representative run. WFS provided client-side vector features and queryable attributes, but is deliberately bounded to 1,000 features and therefore cannot promise complete coverage for larger feature types.

### Future ordering recommendation

Keep the current ordering unchanged in this ticket. For a future evidence-backed change, evaluate:

1. WMS for fast, complete viewport imagery and authoritative server styling.
2. MapServer for native server rendering plus reliable `identify`.
3. FeatureServer for viewport-tiled PBF or native pagination and vector interaction.
4. WFS after checking that a Terria-compatible output format is advertised.
5. Direct GeoJSON, CSV-GEO-AU, and KML/KMZ file resources.

This would place FeatureServer ahead of WFS, because native tiled requests avoid WFS's fixed 1,000-feature ceiling and because real catalog WFS output-format compatibility is inconsistent. A future change needs a broader catalog sample before altering the constant.

## Follow-up findings

- WMS/WFS discovery remains a Magda web-client concern. Each selector change remounts the iframe and starts a fresh secure lifecycle generation; the compatibility layer correctly lets `selectedWmsLayerName` or `selectedWfsFeatureTypeName` override any conflicting URL query selection.
- Discovery should eventually filter or warn on WFS services that do not advertise a Terria-compatible output format. The WA failure is a source-service/output-format limitation, not an adapter regression.
- TerriaJS 8.13's native tiled FeatureServer path was intentionally preserved. During exploratory clicks on the explicit `/FeatureServer/1` candidate, its pick path generated `/FeatureServer/1/query/query`; loading/rendering remained successful, but explicit-layer feature picking should be raised and fixed upstream rather than worked around by forcing `tileRequests` off in this adapter.
- Public remote endpoints can be intermittently slow. The repeatable runner supports narrow retries, while deterministic adapter, lifecycle, empty, Storage API, and error behavior remains covered by local tests.
