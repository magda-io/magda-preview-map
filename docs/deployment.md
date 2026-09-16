# Deployment

## Production image

The repository-root `Dockerfile` builds the TerriaMap application and runs it on
Node 24 with `terriajs-server` 5.0.0. The final image contains production server
dependencies and built static assets only, runs as the `node` user, and starts
through the supported `terriajs-server` executable.

The image defaults to `serverconfig.json` and port 3001. Deployments can set:

- `SERVER_CONFIG_PATH` for a mounted server configuration;
- `CLIENT_CONFIG_PATH` for a partial client configuration override;
- `DEFAULT_CLIENT_CONFIG_PATH` and `RUNTIME_CLIENT_CONFIG_PATH` when using
  nonstandard image paths.

The startup wrapper deep-merges the partial client override into the built client
configuration. This allows parent origins to change at deployment time without
removing the image's initialization, viewer, or branding settings.

## Helm

The chart keeps port 6110 as its default and renders `serverConfig.port` into the
Service, container port, and health probe. `serverConfig.allowProxyFor`, replica,
autoscaler, resources, rolling-update, and Magda image override behavior remain
configurable.

Cross-origin Magda parents are configured with exact origins:

```yaml
clientConfig:
  parentMessageAllowedOrigins:
    - https://catalog.example.org
```

The chart renders this as `parameters.parentMessageAllowedOrigins` and mounts it
as a runtime client override. Changing either server or client configuration
changes the Deployment pod-template checksum.

## Basemap

The shipped init source sets `baseMaps.defaultBaseMapId` to
`basemap-openstreetmap`. The unchanged Magda caller still asks for the retired
Carto-backed `Positron (Light)` by its TerriaJS 6 name. The message compatibility
layer selects an operator-configured basemap of that name when present and
otherwise explicitly selects the configured default. Operators that require a
licensed alternative can define it in their init source without changing the
Magda web client.

## Local real-client verification

Use a desktop/medium viewport; the small-screen web client follows a separate
NationalMap link path instead of mounting this iframe.

1. Build and run this candidate on port 3001 with a runtime client override that
   contains `parameters.parentMessageAllowedOrigins: ["http://127.0.0.1:3000"]`.
2. Build the unmodified `magda-web-client` checkout and serve it on
   `http://127.0.0.1:3000`. Its `server-config.js` should retain the target Magda
   site's API URLs and set only `previewMapBaseUrl` to
   `http://127.0.0.1:3001/`.
3. Open public distribution routes of the form
   `/dataset/<dataset-id>/distribution/<distribution-id>/details` and verify
   that the Map Preview iframe appears, reaches `loading complete` (the spinner
   clears), and displays data.
4. For WMS/WFS, select at least two discovered layers/types in turn. Each change
   remounts the iframe; verify a fresh `ready`/start/completion exchange and that
   the selected member, not a conflicting URL member, is requested.
5. With both servers running, execute `yarn test:e2e:real-client`. It records
   representative WMS, WFS, MapServer, FeatureServer, GeoJSON, CSV, KML, KMZ,
   and error outcomes, request URLs, and elapsed time in
   `test-results/real-client-smoke-results.json`. Override its defaults with
   `MAGDA_WEB_CLIENT_URL`, `PREVIEW_MAP_URL`, `REAL_CLIENT_RESULTS`, or a
   comma-separated `REAL_CLIENT_CASES` list. The GeoJSON and CSV-GEO-AU cases
   keep the real catalog routes and caller payloads but substitute checked-in
   two-point files for provider responses, because those providers currently
   return HTTP 403 to `terriajs-server` while succeeding for direct downloads.

Do not add the local origin permanently to production values. A mounted runtime
override is sufficient; rebuilding the image is unnecessary.

## Verification and releases

CI uses Node 22 for application tooling, runs unit/compatibility/server tests,
builds production assets, runs the Playwright iframe protocol tests, lints and
renders Helm, and builds the Node 24 image.

Published GitHub releases build a `linux/amd64` and `linux/arm64` image at
`ghcr.io/magda-io/magda-preview-map` and publish the Helm chart to
`oci://ghcr.io/magda-io/charts`. The chart defaults to that GHCR image. The
release tag, `package.json` version, and chart version must match; see the
[versioning and release process](ci-version-release.md).
