# TerriaMap v0.4.8 Upgrade Design

## Status

Proposed implementation design for upgrading `magda-preview-map` to TerriaMap `v0.4.8` / TerriaJS `8.13.0` while preserving the current Magda preview integration contract.

## Goal

Upgrade `magda-preview-map` from its current TerriaJS 6-era implementation to TerriaMap `v0.4.8` while keeping the existing Magda dataset-preview flow working without requiring a coordinated Magda web-client release.

The upgrade should:

- use TerriaMap `v0.4.8` as the new application/build/runtime foundation;
- keep Magda-specific behaviour in a small compatibility layer;
- preserve the existing Magda web-client iframe contract;
- use modern TerriaJS models for WMS, WFS, Esri and file formats rather than carrying old loader implementations forward;
- resolve existing WFS / FeatureServer problems where the modern TerriaJS implementation already provides the required behaviour;
- make the upgraded preview easy to verify end-to-end against the real Magda web client and public datasets from `dev.magda.io`.

## Non-goals

- Redesign the Magda dataset page or its preview UX.
- Require a Magda web-client change before the upgraded preview can be deployed.
- Add advanced visualisation features unrelated to preserving the existing map-preview behaviour.
- Migrate all image registries, Helm publication mechanisms or other release infrastructure unless required for TerriaMap v0.4.8 compatibility.
- Preserve Carto `Positron (Light)` as the actual basemap when no appropriate Carto licence is configured.

## Relevant repositories and source of truth

There are two codebases involved in the compatibility boundary.

### Preview application

Repository: `magda-io/magda-preview-map`

This repository owns:

- TerriaMap/TerriaJS application setup;
- the legacy `magda-item` catalog/reference compatibility layer;
- Magda Registry / Storage API resolution performed inside the preview;
- map rendering;
- iframe lifecycle responses (`"ready"`, `"loading complete"`, error payloads);
- terriajs-server, Docker and Helm deployment.

### Magda web-client caller

The authoritative caller is:

`magda-io/magda/magda-web-client/src/Components/Common/DataPreviewMap.tsx`

This file should be reviewed whenever the preview contract changes. It currently owns:

- choosing the preferred distribution for preview;
- normalising WMS/WFS capability URLs;
- fetching WMS/WFS capabilities for the layer/type selector;
- choosing the initial WMS layer / WFS feature type;
- constructing the legacy `type: "magda-item"` start payload;
- creating the preview iframe using `config.previewMapBaseUrl`;
- waiting for the preview `"ready"` message;
- posting the Terria init source into the iframe;
- keeping the parent spinner visible until `"loading complete"` or an error is received;
- displaying the user-facing preview error state.

For compatibility purposes, this caller is more authoritative than incidental behaviour inside the old `MagdaCatalogItem` implementation.

## Current Magda web-client behaviour

### Distribution preference

By default, `DataPreviewMap.tsx` prefers preview distributions in this order:

1. WMS
2. Esri MapServer
3. WFS
4. Esri FeatureServer
5. GeoJSON
6. `csv-geo-au`
7. KML
8. KMZ

The list can be overridden by Magda web-client configuration.

This distinction matters for testing: CZML is supported by the old preview implementation, but it is not part of the Magda web client's default preview preference. CZML compatibility can be retained in the adapter where inexpensive, but it is not a mandatory default Magda web-client end-to-end scenario unless the client is configured to select it.

### WMS / WFS selection ownership

For WMS and WFS, the web client fetches capabilities and selects a member before creating the preview payload.

The effective caller-side precedence is:

1. layer/type encoded in the distribution URL;
2. distribution title if it exactly matches a capability member name;
3. first capability member.

When a value is selected, it is sent to the preview as:

- `selectedWmsLayerName`; or
- `selectedWfsFeatureTypeName`.

Therefore the upgraded preview's primary rule is:

> If the caller supplies `selectedWmsLayerName` or `selectedWfsFeatureTypeName`, honour that value exactly.

The preview still needs a safe first-member/default fallback when no selected name is supplied, for example when the web client does not render a selector or another legacy caller sends the same contract directly.

The compatibility adapter should not duplicate caller-side capability-selection logic unnecessarily.

### Actual start payload

`DataPreviewMap.tsx` currently constructs a catalog item equivalent to:

```json
{
  "name": "Distribution title",
  "type": "magda-item",
  "url": "<config.baseUrl>",
  "storageApiUrl": "<config.storageApiBaseUrl>",
  "distributionId": "<distribution identifier>",
  "defaultBucket": "magda-datasets",
  "isEnabled": true,
  "zoomOnEnable": true,
  "selectedWmsLayerName": "<optional selected layer>",
  "selectedWfsFeatureTypeName": "<optional selected feature type>"
}
```

and wraps it in a Terria init source containing:

```json
{
  "catalog": ["<catalog item above>"],
  "baseMapName": "Positron (Light)",
  "homeCamera": {
    "north": -8,
    "east": 158,
    "south": -45,
    "west": 109
  },
  "corsDomains": ["<Magda external hostname>"]
}
```

The iframe URL is:

```text
<config.previewMapBaseUrl>#mode=preview&hideExplorerPanel=1
```

Phase 1 of the upgrade must accept this payload unchanged.

### Parent/iframe lifecycle

The current lifecycle is:

1. The preview iframe starts and posts `"ready"`.
2. `DataPreviewMap.tsx` receives `"ready"` from that iframe window.
3. The parent posts the legacy init source into the iframe.
4. The parent keeps its spinner visible.
5. On success, the preview posts `"loading complete"`.
6. The parent hides the spinner.
7. On failure, the preview posts a JSON string with the shape:

```json
{
  "type": "error",
  "title": "...",
  "message": "..."
}
```

8. The parent marks loading complete and displays its preview error state.

The parent currently checks `event.source` against the iframe window. Its outgoing `postMessage` call uses `"*"` as the target origin.

The upgraded preview must not rely on the wildcard for inbound trust. TerriaJS 8 origin validation should remain enabled and legitimate parent origins must be explicitly allowed when the embedding is cross-origin.

## Existing Magda behaviour to preserve

### Magda Registry lookup

The preview must continue to load the requested Magda distribution by `distributionId` and retain compatible dataset/distribution lookup behaviour needed by existing legacy inputs.

### Dataset format override

Where both `dcat-distribution-strings.format` and `dataset-format.format` exist, `dataset-format` should continue to take precedence.

### Internal storage URLs

Translate pseudo URLs of the form:

```text
magda://storage-api/<dataset-id>/<distribution-id>/<file-name>
```

into the configured Storage API URL.

Accept both:

- `defaultBucket`, which is what the current Magda web client sends; and
- `datasetBucket`, for backward compatibility with the old preview model.

If neither is supplied, use `magda-datasets`.

### Supported formats

The compatibility layer should retain practical support for:

- WMS
- WFS
- Esri MapServer
- Esri FeatureServer
- GeoJSON
- KML / KMZ
- geographic CSV
- CZML where already supported and low-cost to retain

Actual Magda web-client default E2E coverage should follow the caller preference list described above.

### Enabled / zoom behaviour

Legacy `isEnabled: true` and `zoomOnEnable: true` must still result in the selected dataset becoming visible and the map reaching an appropriate view.

## Architecture

### Principle: new upstream foundation, thin Magda compatibility seam

Do not incrementally upgrade the old TerriaJS 6 fork in place.

Start from TerriaMap `v0.4.8` and add only the Magda-specific compatibility behaviour required by the caller contract.

```text
Magda web client / DataPreviewMap.tsx
        |
        | legacy `magda-item` init source
        v
MagdaPreviewReference compatibility adapter
        |
        +-- Registry lookup
        +-- dataset-format resolution
        +-- Storage API URL rewrite
        +-- legacy selected WMS/WFS traits
        +-- FeatureServer root-to-layer resolution
        v
TerriaJS 8 native catalog models
        |
        +-- WMS / WFS
        +-- Esri MapServer / FeatureServer
        +-- GeoJSON
        +-- KML / KMZ
        +-- CSV
        +-- optional retained CZML
        v
TerriaMap v0.4.8 rendering / interaction
```

### Local compatibility model

Add a local model, tentatively named `MagdaPreviewReference`, registered as:

```text
magda-item
```

Responsibilities:

1. accept the legacy caller payload;
2. load the requested Registry record;
3. resolve relevant distribution metadata and format;
4. rewrite Magda Storage API pseudo URLs;
5. map the distribution to a modern TerriaJS model definition;
6. honour explicit `selectedWmsLayerName` / `selectedWfsFeatureTypeName` values;
7. apply a safe WMS/WFS fallback when no explicit selection is supplied;
8. resolve a bare FeatureServer service to a usable layer item;
9. preserve relevant enabled/zoom traits;
10. dereference to the native TerriaJS model.

Do not duplicate the current TerriaJS loaders for WMS, WFS, Esri, GeoJSON, KML or CSV.

TerriaJS 8.13 contains an upstream `MagdaReference`, but it is deprecated. Its implementation may inform registry/format behaviour, but the preview should not make that deprecated type its long-term external compatibility contract.

## Esri FeatureServer handling

Issue #26 documents the current service-root failure.

### Explicit layer URL

For:

```text
.../FeatureServer/3
```

preserve the layer ID and create/use a modern FeatureServer item directly.

### Service root URL

For:

```text
.../FeatureServer
```

load service metadata and resolve a previewable layer. Selecting the first previewable layer is acceptable when the caller has provided no more specific layer selection.

Use TerriaJS's native FeatureServer request strategy rather than the old service-level GeoJSON path: tiled PBF requests where supported, otherwise native FeatureServer query/pagination.

## WFS request limits

Modern TerriaJS provides bounded WFS requests using `maxFeatures`.

Do not retain a local implementation solely to work around issue #18. Instead, make #18 a regression test confirming the upgraded preview no longer initiates an unbounded multi-gigabyte WFS download.

## Iframe lifecycle bridge

Implement a small preview-specific bridge around the modern TerriaJS loading state.

It must send:

- `"loading complete"` when the final selected/dereferenced map item has completed the relevant loading; or
- the legacy JSON error payload when the preview cannot load the item.

Do not treat Terria application bootstrap completion as dataset loading completion.

This behaviour is critical because `DataPreviewMap.tsx` keeps the parent spinner visible until one of those two terminal messages arrives.

## Parent-message security

TerriaJS 8 validates messages accepted by `updateApplicationOnMessageFromParentWindow`.

Same-origin parents are allowed automatically. Cross-origin parents must be configured using:

```text
parameters.parentMessageAllowedOrigins
```

Expose that through Helm/client configuration.

Important for local development: different localhost ports are different origins. If the Magda web client and `magda-preview-map` run on separate local ports, the preview's local configuration must explicitly allow the Magda web-client origin unless a local reverse proxy makes them same-origin.

Tests should cover:

- same-origin embedding;
- configured cross-origin embedding;
- rejected unconfigured cross-origin messages.

A future Magda web-client hardening change may replace its outgoing `postMessage(..., "*")` target with the actual preview origin, but that is not required for this preview-map upgrade and must not become a deployment prerequisite.

## UI migration

Do not port the old preview UI's direct imports of TerriaJS internal React components.

Use the `v0.4.8` `StandardUserInterface` / current composition mechanisms, then preserve the compact preview experience exposed by:

```text
#mode=preview&hideExplorerPanel=1
```

Required behaviour:

- map fills the preview area;
- selected data is visible;
- zoom controls remain usable;
- feature picking/info remains usable where supported;
- explorer/workbench workflow is hidden;
- notifications do not unnecessarily obscure the embedded map.

## Basemap migration

`DataPreviewMap.tsx` currently hard-codes:

```text
baseMapName: "Positron (Light)"
```

TerriaMap no longer ships Carto Positron/Dark Matter as generally free defaults.

For Phase 1 compatibility:

- do not require a simultaneous Magda web-client change;
- treat an incoming `Positron (Light)` request as a legacy alias/fallback request;
- render the configured free/default basemap, such as OpenStreetMap, when Positron is unavailable;
- document the licence-driven behaviour change.

A later Magda web-client cleanup can stop sending the obsolete basemap name.

## Server and Helm migration

Upgrade to terriajs-server `5.0.0` as used by TerriaMap `v0.4.8`.

Preserve important existing chart behaviour where practical:

```yaml
serverConfig:
  port: 6110
  allowProxyFor:
    - ...
```

Also preserve:

- replicas/autoscaler behaviour;
- resource requests/limits;
- rolling update on config changes;
- Magda image repository/name/tag overrides.

Add client configuration for parent origins, for example:

```yaml
clientConfig:
  parentMessageAllowedOrigins: []
```

Regression-test historical proxy redirect/crash cases described by #16 and #24.

## CI / release migration

Move from the old Node 10 / legacy Actions workflow to the supported TerriaMap v0.4.8 runtime range.

Use Node 22+; Node 24 is the preferred production image/runtime unless a discovered compatibility constraint requires otherwise.

CI should validate:

- lockfile-based dependency install;
- lint/type checks;
- production build;
- automated compatibility tests;
- Helm lint/render;
- Docker image build.

Keep current Helm publication / Docker Hub compatibility initially unless separately approved for migration.

## Testing strategy

The upgrade should use three complementary levels of testing.

### 1. Automated compatibility / characterization tests

Before deleting the old implementation, encode the external contract derived from `DataPreviewMap.tsx` and the existing preview behaviour.

Cover at minimum:

- legacy `type: "magda-item"` payload;
- `distributionId` registry lookup;
- `dataset-format` override;
- `magda://storage-api` rewrite;
- `defaultBucket` and `datasetBucket` compatibility;
- WMS explicit selected layer;
- WMS no-explicit-selection fallback;
- WFS explicit selected feature type;
- WFS no-explicit-selection fallback;
- Esri MapServer;
- Esri FeatureServer explicit layer;
- GeoJSON;
- KML/KMZ;
- geographic CSV;
- unsupported format;
- registry/network error.

CZML can have adapter-level coverage if retained, but it is not required in the default Magda web-client E2E matrix.

### 2. Minimal iframe protocol harness

Keep an automated lightweight parent harness that mirrors the important `DataPreviewMap.tsx` protocol:

1. create iframe with `#mode=preview&hideExplorerPanel=1`;
2. wait for `"ready"`;
3. post the same init-source shape produced by `createCatalogItemFromDistribution`;
4. wait for `"loading complete"` or the JSON error payload;
5. verify parent loading state terminates.

This gives stable CI coverage without requiring the full Magda monorepo.

### 3. Real Magda web-client end-to-end test

Before considering the migration complete, run the real Magda web client locally against the candidate `magda-preview-map`.

Magda's documented frontend development flow is:

```bash
# from the magda repository root
yarn install
cd magda-web-client
yarn run dev
```

By default the local web client connects to:

```text
https://dev.magda.io/api
```

This gives the local UI access to the public datasets available from `dev.magda.io`, making it a practical manual/integration test environment without running the full Magda backend locally.

Configure the local web client so `config.previewMapBaseUrl` points to the locally running candidate preview map. If the two applications use different origins/ports, configure the candidate preview's `parentMessageAllowedOrigins` accordingly.

Use representative public `dev.magda.io` datasets for the end-to-end smoke suite. Prefer service distributions or small files so the Magda web client's own file-size warning does not obscure the preview test.

The real-client smoke test should verify:

- dataset page renders the Map Preview section;
- iframe loads from the candidate preview-map;
- parent spinner clears;
- selected WMS/WFS member follows the web-client selector;
- feature interaction works where appropriate;
- error state terminates cleanly rather than leaving a permanent spinner.

## Existing bug regressions

Include explicit coverage for:

- #18 — large WFS request is bounded;
- #26 — FeatureServer service root and explicit layer both work;
- #16 — redirected proxied resource behaviour;
- #24 — proxy errors/redirects do not crash the server.

## Acceptance matrix

| Scenario | Expected result |
| --- | --- |
| Existing `DataPreviewMap.tsx` sends `type: magda-item` | Accepted unchanged |
| `defaultBucket` from current Magda caller | Accepted |
| Legacy `datasetBucket` | Accepted |
| Internal Storage API distribution | URL rewritten and data loads |
| WMS caller-selected layer | Exact requested layer renders |
| WMS no selected layer | Valid fallback member renders |
| WFS caller-selected feature type | Exact requested type renders |
| WFS no selected type | Valid fallback member renders |
| Large WFS | Request is bounded |
| Esri MapServer | Renders through modern model |
| FeatureServer `/FeatureServer/<id>` | Layer ID preserved and renders |
| FeatureServer service root | Adapter resolves usable layer |
| GeoJSON | Renders |
| KML/KMZ | Renders |
| Geographic CSV | Renders when selected by current preview rules |
| Parent receives `ready` | Existing handshake works |
| Successful load | Parent receives `loading complete`; spinner clears |
| Failed load | Parent receives legacy JSON error; spinner clears |
| `#mode=preview&hideExplorerPanel=1` | Compact embedded preview |
| Same-origin embedding | Works |
| Allowed cross-origin embedding | Works |
| Unapproved cross-origin embedding | Start data rejected |
| Legacy `Positron (Light)` request | Falls back to configured free/default basemap |
| Real local Magda web client + public `dev.magda.io` dataset | Preview works end-to-end |
| Helm deployment | Important existing values remain compatible |
| Proxy redirect/error | Server remains healthy |

## Delivery plan

### Stage 1 — Characterize the caller contract

Treat `DataPreviewMap.tsx` as the source of truth for the current parent-side protocol and add characterization tests before deleting the old implementation.

Deliverable: automated compatibility suite plus minimal iframe harness.

### Stage 2 — Adopt TerriaMap v0.4.8 foundation

Replace the old TerriaJS 6 application/build structure with the upstream v0.4.8 foundation.

Deliverable: modern TerriaMap shell builds and runs in preview mode.

### Stage 3 — Implement `magda-item` compatibility adapter

Implement `MagdaPreviewReference`, Registry/Storage URL handling and modern native model mapping.

Deliverable: non-lifecycle characterization tests pass.

### Stage 4 — Restore iframe lifecycle and origin handling

Implement modern loading-state observation and secure parent messaging.

Deliverable: protocol harness and real parent spinner/error behaviour pass.

### Stage 5 — Upgrade server/deployment/CI

Move to terriajs-server 5, supported Node, updated Docker/Helm and modern CI.

Deliverable: deployable candidate image/chart.

### Stage 6 — Real Magda web-client regression and cleanup

Run the local Magda web client connected to `dev.magda.io`, point it at the candidate preview, execute the representative public-dataset smoke suite, migrate the default basemap behaviour, remove obsolete v6 code and update operator docs.

Deliverable: current Magda web client works unchanged against the upgraded preview-map.

## Follow-up work after compatibility release

Once the upgraded preview has been deployed successfully, consider a separate Magda web-client cleanup to:

- stop sending `baseMapName: "Positron (Light)"`;
- use the actual preview origin rather than `"*"` as the outgoing `postMessage` target;
- potentially move from the legacy `magda-item` contract to a newer explicit contract if doing so materially simplifies both repositories.

These are intentionally follow-up changes rather than prerequisites for the v0.4.8 migration.

## Tracking

Parent issue: #19

Implementation issues:

- #27 — characterize legacy Magda preview compatibility contract
- #28 — adopt TerriaMap v0.4.8 application/build foundation
- #29 — implement TerriaJS 8 legacy `magda-item` compatibility adapter
- #30 — restore iframe lifecycle and parent-message origin security
- #31 — upgrade terriajs-server, Docker, Helm and CI/release pipeline
- #32 — migrate preview basemap and complete cleanup/regression validation

Existing regression issues:

- #18 — WFS maxFeatures
- #26 — Esri FeatureServer preview
- #16 / #24 — proxy redirect/error behaviour
