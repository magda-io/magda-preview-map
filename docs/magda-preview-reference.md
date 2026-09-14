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
`maxFeatures=1000` bounded request. FeatureServer previews use the native JSON
pagination path rather than the removed TerriaJS 6 service-level GeoJSON path.

Legacy `isEnabled` is bridged to `terria.workbench.add`, which dereferences and
loads the target. `zoomOnEnable` maps to `zoomOnAddToWorkbench`.

## Tests

The #27 characterization fixtures now run against the TerriaJS 8 adapter driver
by default. The historical TerriaJS 6 baseline remains available through
`yarn test:characterization:legacy`. `test/adapter` adds focused checks for the
new model mapping and native loader integration points.
