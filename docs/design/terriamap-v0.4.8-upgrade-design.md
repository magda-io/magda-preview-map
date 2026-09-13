# TerriaMap v0.4.8 Upgrade Design

## Status

Proposed implementation design for upgrading `magda-preview-map` to TerriaMap `v0.4.8` / TerriaJS `8.13.0` while preserving the current Magda preview integration contract.

## Goal

Upgrade `magda-preview-map` from its current TerriaJS 6-era implementation to TerriaMap `v0.4.8` while keeping existing Magda dataset preview behaviour working for callers that still send the legacy `magda-item` payload.

The upgrade should also retire avoidable forked TerriaMap code, adopt current TerriaJS/server/build infrastructure, and use modern TerriaJS behaviour to resolve existing preview issues where possible.

## Non-goals

- Redesign the Magda dataset page or its preview UI.
- Change the Magda web client contract as a prerequisite for the upgrade.
- Add advanced visualization capabilities unrelated to preserving current preview behaviour.
- Migrate all image registries, Helm distribution mechanisms, or other deployment conventions unless required for TerriaMap v0.4.8 compatibility.
- Preserve the Carto `Positron (Light)` basemap if doing so requires a paid or incompatible licence.

## Background

`magda-preview-map` is a fork of TerriaMap that currently contains a custom `MagdaCatalogItem` and a simplified embedded map UI. The current repository is based on an old TerriaJS application architecture and build stack.

TerriaMap `v0.4.8` uses:

- TerriaJS `8.13.0`
- terriajs-server `5.0.0`
- Node.js 22+
- React 18
- Webpack 5
- modern Sass / TypeScript tooling

The existing Magda-specific behaviour was introduced mainly by historical PRs #8 and #13 and remains relied on by the current Magda web client.

Relevant existing issues:

- #19 — dependency / TerriaJS upgrade
- #18 — WFS requests should be bounded by `maxFeatures`
- #26 — Esri FeatureServer preview currently fails for service-level endpoints
- #16 / #24 — proxy redirect / crash behaviour in the old terriajs-server generation

## Current external compatibility contract

The upgrade must initially remain compatible with the existing Magda web client without requiring coordinated deployment.

The parent page currently embeds the preview map and sends Terria start data containing a catalog item similar to:

```json
{
  "name": "Distribution title",
  "type": "magda-item",
  "url": "https://magda.example",
  "storageApiUrl": "https://magda.example/api/v0/storage/",
  "distributionId": "dist-...",
  "defaultBucket": "magda-datasets",
  "isEnabled": true,
  "zoomOnEnable": true,
  "selectedWmsLayerName": "optional-layer",
  "selectedWfsFeatureTypeName": "optional-feature-type"
}
```

The preview iframe currently participates in this lifecycle:

1. Preview iframe posts `"ready"`.
2. Parent sends start data.
3. Preview loads and renders the selected distribution.
4. Preview posts `"loading complete"` when the selected map item finishes loading.
5. On failure, preview posts a JSON string with the shape:

```json
{
  "type": "error",
  "title": "...",
  "message": "..."
}
```

This message contract is part of the compatibility boundary and must be covered by automated tests.

## Existing behaviour to preserve

### Magda registry lookup

The preview must continue to support loading either a specific Magda distribution or, where required for backward compatibility, a dataset whose distributions are examined for the first supported preview type.

### Supported distribution formats

The compatibility layer must preserve support for the currently previewable formats:

- WMS
- WFS
- Esri MapServer
- Esri FeatureServer
- GeoJSON
- KML / KMZ
- CSV / geographic CSV
- CZML where currently supported

The implementation may use newer TerriaJS model types internally.

### Dataset format override

Where a Magda record has both `dcat-distribution-strings.format` and `dataset-format.format`, the `dataset-format` value should continue to take precedence.

### Internal storage URLs

The preview must continue to translate Magda pseudo URLs of the form:

```text
magda://storage-api/<dataset-id>/<distribution-id>/<file-name>
```

into a runtime-accessible Storage API URL using the configured storage base URL and bucket.

For backward compatibility, both `datasetBucket` and the currently emitted `defaultBucket` field should be accepted. If neither is provided, the effective default remains `magda-datasets`.

### WMS layer selection

The preview must preserve the following precedence:

1. `selectedWmsLayerName` supplied by the parent.
2. Layer encoded in the distribution URL.
3. Matching distribution title/name where practical.
4. First available WMS layer.

### WFS feature type selection

The preview must preserve equivalent behaviour for WFS:

1. `selectedWfsFeatureTypeName` supplied by the parent.
2. Feature type encoded in the distribution URL.
3. Matching distribution title/name where practical.
4. First available feature type.

### Zoom and map interaction

Legacy `zoomOnEnable` / enabled-item behaviour must result in the preview rendering and zooming to the selected data in a way that is functionally equivalent to the existing preview.

### Embedded preview mode

The current iframe URL uses:

```text
#mode=preview&hideExplorerPanel=1
```

This must continue to produce a compact embedded map rather than exposing the full Terria application workflow.

## Architecture

### Principle: new upstream foundation, small Magda compatibility seam

The upgrade should start from the TerriaMap `v0.4.8` application/build/runtime structure rather than incrementally modernising the old fork.

The desired architecture is:

```text
Existing Magda web client
        |
        | legacy `magda-item` start JSON
        v
Magda preview compatibility adapter
        |
        +-- Magda Registry API
        +-- Storage API URL resolver
        +-- WMS/WFS legacy selection mapping
        |
        v
TerriaJS 8 native catalog models
        |
        +-- WMS
        +-- WFS
        +-- Esri MapServer
        +-- Esri FeatureServer
        +-- GeoJSON
        +-- KML/KMZ
        +-- CSV
        +-- CZML
        v
TerriaMap v0.4.8 rendering / interaction
```

### Do not port the old `MagdaCatalogItem` literally

TerriaJS 8 already contains a modern `MagdaReference` implementation and modern native models for the supported map formats. The old `MagdaCatalogItem.js` should not be mechanically translated line-by-line into the new model architecture.

Instead, add a local compatibility model, tentatively named `MagdaPreviewReference`, registered under the legacy type:

```text
magda-item
```

This model is responsible only for the Magda preview-specific compatibility surface that TerriaJS does not provide directly.

### `MagdaPreviewReference` responsibilities

The compatibility model should:

1. Accept legacy `magda-item` fields.
2. Retrieve the requested Magda record from the Registry API.
3. Resolve dataset/distribution records and format metadata.
4. Rewrite `magda://storage-api/...` URLs.
5. Map the selected distribution into a modern TerriaJS model definition.
6. Translate legacy WMS/WFS layer-selection fields into current TerriaJS traits.
7. Resolve a service-level Esri FeatureServer URL to a usable layer-level item when necessary.
8. Apply compatible overrides / item properties where still required.
9. Return the modern TerriaJS target model through the reference-model mechanism.

It should not duplicate modern WMS, WFS, Esri, GeoJSON, KML, CSV, or CZML loading logic.

### Upstream `MagdaReference`

TerriaJS 8.13 includes `MagdaReference`, but it is deprecated upstream. It can be used as a reference for registry behaviour and format mapping, but the preview should avoid tightly coupling its long-term compatibility contract to that deprecated model.

Reusable logic should be kept local and narrow enough that replacing upstream `MagdaReference` later does not require another application-wide migration.

## Esri FeatureServer handling

Issue #26 documents a current bug where a service-level FeatureServer URL is queried through an obsolete service-level path and then parsed incorrectly.

Modern TerriaJS has a native `esri-featureServer` item that supports layer-level loading and pagination.

The compatibility adapter should implement these cases:

### Explicit layer URL

For:

```text
.../FeatureServer/3
```

create a modern `esri-featureServer` model directly using that URL.

### Service root URL

For:

```text
.../FeatureServer
```

load the service metadata and choose an appropriate layer. For compatibility with the current preview behaviour, defaulting to the first previewable layer is acceptable when no more specific selection exists.

The adapter must not strip an explicitly supplied layer ID.

Issue #26 should become a regression/acceptance test for this work.

## WFS request limits

Modern TerriaJS already applies a bounded `maxFeatures` value to WFS GetFeature requests. The upgrade should rely on the modern implementation rather than carry a local patch.

Issue #18 should become an acceptance test verifying that a historically problematic WFS endpoint no longer triggers an unbounded multi-gigabyte request.

## Iframe lifecycle bridge

The old code used Knockout subscriptions on the created catalog item's loading state to notify the parent.

In TerriaJS 8, introduce a small preview-specific lifecycle bridge that observes the final dereferenced target / workbench item and sends:

- `"loading complete"` after the selected map item has completed the relevant metadata/map-item loading; or
- the legacy JSON error message if loading fails.

Do not send `"loading complete"` merely because Terria application bootstrap is complete.

The parent-side spinner behaviour is part of the acceptance criteria.

## Parent-window origin security

Modern TerriaJS validates messages received by `updateApplicationOnMessageFromParentWindow`.

Same-origin parents are allowed automatically. Cross-origin embedders must be listed in:

```text
parameters.parentMessageAllowedOrigins
```

The Helm chart must expose a client configuration value for this list so deployments with the Magda web client and preview map on different origins can explicitly permit the parent origin.

Tests must cover:

- same-origin iframe communication;
- configured cross-origin iframe communication;
- rejection of an unconfigured cross-origin sender.

Do not restore wildcard inbound trust as a compatibility workaround.

## UI migration

The old preview UI imports internal TerriaJS React components directly. These imports should not be ported unchanged.

The new UI should build on the `v0.4.8` `StandardUserInterface` / current supported composition points and then hide or omit controls that are unnecessary for an embedded preview.

Required user-visible behaviour:

- map occupies the preview area;
- selected data is visible;
- zoom controls remain usable;
- feature picking / feature information remains usable where supported;
- explorer/workbench UI remains hidden in preview mode;
- notifications should not obscure the embedded preview unless interaction is required.

## Basemap migration

The current Magda parent payload and preview init request `Positron (Light)`.

Current TerriaMap no longer includes the Carto Positron/Dark Matter basemaps by default because they are no longer generally free to use without an appropriate Carto licence.

The upgraded preview should use a genuinely free/default basemap such as OpenStreetMap unless a deployment explicitly configures a licensed alternative.

For rollout compatibility, incoming legacy start data that asks for:

```text
Positron (Light)
```

should not cause the preview to fail. It should fall back to the configured preview default basemap.

A later Magda web-client change should stop sending the obsolete base-map name.

## Server and proxy migration

Upgrade to terriajs-server `5.0.0` as provided by TerriaMap `v0.4.8`.

Keep the existing Helm-facing proxy configuration model where practical:

```yaml
serverConfig:
  port: 6110
  allowProxyFor:
    - ...
```

The old proxy implementation has historical redirect/crash issues (#16 / #24). The upgraded server should be tested against representative redirected data URLs and allow-list enforcement.

Do not retain the old internal server command path as an intentional API. Prefer the supported TerriaMap/server startup pattern for the selected v0.4.8 foundation.

## Helm configuration

Preserve existing chart behaviour where practical:

- port `6110`
- configurable `serverConfig.allowProxyFor`
- replicas / autoscaler behaviour
- resource requests/limits
- rolling deployment on config changes
- existing Magda image value conventions

Add client-side configuration for at least:

```yaml
clientConfig:
  parentMessageAllowedOrigins: []
```

The Helm templates should render the relevant Terria client configuration without requiring users to modify the image.

## CI / release migration

The current workflow still uses Node 10 and old GitHub Actions versions. Move build validation to the supported Node range for TerriaMap v0.4.8, using Node 22 or 24 as the primary runtime.

The CI migration should include:

- dependency install with lockfile enforcement;
- lint;
- production build;
- automated compatibility tests;
- Helm lint/render validation;
- Docker image build.

Keep the existing Helm publication destination and Docker Hub compatibility initially unless there is a separate approved migration for distribution infrastructure.

## Testing strategy

### 1. Characterization tests

Before removing the old model, encode the current external behaviour as tests.

At minimum include fixtures for:

- `magda://storage-api` URL rewriting;
- `dataset-format` override;
- WMS layer from URL;
- WMS `selectedWmsLayerName`;
- WMS first-layer fallback;
- WFS feature type from URL;
- WFS `selectedWfsFeatureTypeName`;
- WFS first-type fallback;
- Esri MapServer;
- Esri FeatureServer explicit layer URL;
- GeoJSON;
- KML;
- KMZ;
- CSV;
- unsupported format;
- registry/network error.

### 2. Iframe integration tests

Create a minimal parent-page harness that behaves like the Magda web client:

1. load the preview iframe;
2. wait for `"ready"`;
3. post legacy start data;
4. assert that the correct distribution is rendered/loaded;
5. wait for `"loading complete"` or expected error;
6. verify the parent loading state terminates.

### 3. Existing bug regressions

Include coverage for:

- #18 large WFS endpoint is bounded;
- #26 FeatureServer service/layer handling;
- redirected proxied resource behaviour related to #16;
- proxy process remains healthy for error/redirect cases related to #24.

### 4. Deployment tests

Validate:

- Docker image starts under the supported Node version;
- server listens on configured port;
- Helm chart renders with defaults;
- custom `allowProxyFor` values are propagated;
- `parentMessageAllowedOrigins` is propagated;
- liveness probe succeeds;
- existing image/tag overrides still render correctly.

## Acceptance matrix

The upgrade is considered complete only when all of the following are demonstrated:

| Scenario | Expected result |
| --- | --- |
| Existing Magda web client sends `type: magda-item` | Accepted without parent changes |
| Internal Storage API distribution | URL rewritten and data loads |
| WMS explicit selected layer | Requested layer renders |
| WMS no selected layer | A valid default/first layer renders |
| WFS explicit selected feature type | Requested type renders |
| WFS no selected feature type | A valid default/first type renders |
| Large WFS | Request is bounded; no multi-GB download |
| Esri MapServer | Renders via modern Terria model |
| FeatureServer `/FeatureServer/<id>` | Layer ID is preserved and renders |
| FeatureServer service root | Adapter resolves a usable layer |
| GeoJSON | Renders |
| KML/KMZ | Renders |
| CSV geographic data | Renders when supported by current preview rules |
| Parent receives `ready` | Existing handshake still works |
| Successful load | Parent receives `loading complete` |
| Failed load | Parent receives legacy JSON error shape |
| Same-origin embedding | Works |
| Allowed cross-origin embedding | Works |
| Unapproved cross-origin embedding | Start data rejected |
| `hideExplorerPanel=1` | Embedded preview remains compact |
| Legacy `Positron (Light)` request | Falls back to configured free/default basemap |
| Helm deployment | Existing important values remain compatible |
| Proxy redirect/error | Server remains healthy |

## Delivery plan

### Stage 1 — Characterize the current contract

Add automated tests and fixtures around the existing parent/preview protocol and Magda-specific model behaviour before changing the TerriaMap foundation.

Deliverable: a regression suite that can fail against an incomplete v0.4.8 migration.

### Stage 2 — Adopt the TerriaMap v0.4.8 foundation

Replace the obsolete application/build/runtime skeleton with the upstream v0.4.8 equivalent.

Deliverable: modern TerriaMap shell builds and runs under Node 22/24.

### Stage 3 — Add the legacy `magda-item` compatibility adapter

Implement `MagdaPreviewReference`, registry lookup, storage URL resolution, distribution mapping, and WMS/WFS compatibility behaviour.

Deliverable: non-Esri compatibility scenarios pass against TerriaJS 8 native models.

### Stage 4 — Esri and iframe lifecycle

Complete MapServer/FeatureServer handling and restore the legacy loading/error parent-window contract.

Deliverable: #26 regression is fixed and the real Magda-style iframe flow passes end-to-end.

### Stage 5 — Server, Helm, and CI migration

Upgrade terriajs-server, Docker runtime, Helm config rendering, origin allow-list configuration, and GitHub Actions.

Deliverable: production-like container/Helm deployment passes regression tests.

### Stage 6 — Basemap migration and cleanup

Replace the obsolete Positron default, preserve graceful fallback for legacy start data, remove dead v6-era code/build files, and run the complete acceptance matrix.

Deliverable: no dependency on the old TerriaMap fork implementation remains beyond intentional Magda compatibility code and deployment packaging.

## Suggested issue structure

Use #19 as the parent tracking issue and link the implementation issues below:

1. Characterize legacy Magda preview compatibility contract.
2. Adopt TerriaMap v0.4.8 application/build foundation.
3. Implement TerriaJS 8 `magda-item` compatibility adapter.
4. Restore iframe lifecycle and configure parent-message origin security.
5. Upgrade terriajs-server, Docker, Helm, and CI/release pipeline.
6. Migrate the preview basemap and complete final cleanup/regression validation.

Existing issues #18 and #26 should be linked as acceptance work rather than duplicated.

## Rollout strategy

The first upgraded release should be deployable without a coordinated Magda web-client release.

Recommended sequence:

1. deploy upgraded preview-map in a test environment with the existing Magda web client;
2. run the acceptance matrix against representative public and internal datasets;
3. canary the preview-map image/chart in a non-production Magda environment;
4. verify iframe messaging, proxying, storage downloads, and representative data formats;
5. deploy preview-map production upgrade;
6. subsequently update the Magda web client to remove legacy `Positron (Light)` and, if desired, move toward a cleaner v8-native start payload;
7. retain the legacy `magda-item` adapter until all supported Magda deployments have moved off the old contract.

## Risks and mitigations

### Risk: v6-to-v8 behaviour differences are hidden by successful compilation

Mitigation: characterization and iframe E2E tests are a prerequisite, not a final hardening step.

### Risk: modern parent-message origin validation breaks cross-origin deployments

Mitigation: expose `parentMessageAllowedOrigins` through Helm and test representative deployment topology before rollout.

### Risk: upstream `MagdaReference` is deprecated

Mitigation: keep Magda preview compatibility in a local, narrow adapter and rely on stable/native Terria model types for actual rendering.

### Risk: service-level FeatureServer URLs still do not identify a layer

Mitigation: make service-root layer resolution explicit in the adapter and cover it with #26 regression fixtures.

### Risk: basemap behaviour changes visually

Mitigation: document the licence-driven change, provide a deterministic free/default basemap, and make legacy `Positron (Light)` requests fall back rather than fail.

### Risk: simultaneous app and deployment changes make regressions difficult to isolate

Mitigation: keep the upstream foundation, compatibility adapter, iframe behaviour, and deployment migration as separately reviewable issues/PRs.

## Decision summary

The upgrade should be implemented as a **TerriaMap v0.4.8 application with a thin Magda compatibility layer**, not as a continuation of the current TerriaJS 6 fork.

The most important invariant is that the existing Magda web client can continue to send `type: "magda-item"` and receive the same iframe lifecycle messages while the internal rendering path moves to TerriaJS 8 native catalog models.
