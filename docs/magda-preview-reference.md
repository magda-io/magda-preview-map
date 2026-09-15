# Magda preview compatibility reference

`MagdaPreviewReference` is the local compatibility seam for the unchanged Magda
web-client catalog member type, `magda-item`. It resolves a Registry record and
returns a native TerriaJS 8 target model; it does not implement data loaders.

## Resolution rules

- `distributionId` requests `dcat-distribution-strings` with optional
  `dataset-format`.
- Legacy `datasetId` requests dereferenced `dataset-distributions`.
- `dataset-format.format` overrides the DCAT format when present.
- `downloadURL` wins over `accessURL`.
- `magda://storage-api/` URLs use
  `defaultBucket ?? datasetBucket ?? "magda-datasets"`.
- Explicit `selectedWmsLayerName` and `selectedWfsFeatureTypeName` values are
  authoritative. Native WMS/WFS groups supply a first-member fallback only when
  the caller supplied no selection.
- A FeatureServer layer URL remains unchanged. A bare FeatureServer root is
  resolved through the native group to a usable layer URL.

The resulting native types are `wms`, `wfs`, `esri-mapServer`,
`esri-featureServer`, `geojson`, `csv`, `kml`, and `czml`. WFS uses the native
`maxFeatures=1000` bounded request. FeatureServer previews use TerriaJS's native
request strategy: tiled PBF requests where supported, otherwise native
FeatureServer query/pagination. This replaces the TerriaJS 6 service-level
GeoJSON path without disabling modern tiled requests.

Legacy `isEnabled` is bridged to `terria.workbench.add`, which dereferences and
loads the target. `zoomOnEnable` maps to `zoomOnAddToWorkbench`.

## Basemap compatibility

The unchanged caller still sends `baseMapName: "Positron (Light)"`. TerriaJS 8
no longer recognises that legacy field, and its free default set does not contain
the old Carto-backed basemap. At the parent-message boundary the compatibility
layer therefore:

1. selects a deployment-provided basemap named `Positron (Light)`, if one exists;
2. otherwise selects the deployment's configured default basemap; and
3. falls back to the first configured basemap only if no default can be resolved.

The shipped default is `basemap-openstreetmap`. This makes the licence-driven
fallback deterministic even if browser storage had selected another basemap.

## Tests

The #27 characterization fixture remains the source-of-truth snapshot of the
unchanged Magda caller and now runs only against the TerriaJS 8 adapter driver.
`test/adapter` covers model mapping and native loader integration;
`test/lifecycle` covers secure messaging, terminal events, generations, and
legacy basemap resolution; Playwright covers the real iframe handshake and
verifies that the default path requests OpenStreetMap rather than Carto tiles.
