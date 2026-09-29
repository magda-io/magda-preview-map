# Magda preview compatibility reference

`MagdaPreviewReference` is the local compatibility seam for the unchanged Magda
web-client catalog member type, `magda-item`. It resolves a Registry record and
returns a native TerriaJS 8 target model; it does not implement data loaders.

## Resolution rules

- `distributionId` requests `dcat-distribution-strings` with optional
  `dataset-format`.
- `datasetId` requests dereferenced `dataset-distributions` and picks one
  distribution by the preview format preference: WMS, Esri MapServer, WFS,
  Esri FeatureServer, GeoJSON, CSV, KML/KMZ, CZML. Equally preferred
  distributions keep Registry order. `distributionId` loads stay exact.
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

## Full-map Magda catalog

In the full map (any `mode` other than `preview`), start data from the Magda
opener gains one `magda-catalog-group` root, `magda-data-catalog`, named
"Magda data catalog". It copies `url`, `storageApiUrl` and the bucket settings
from the incoming `magda-item`, is never enabled, and is not added when the
root already exists. The compact preview's start data is unchanged.

`MagdaCatalogGroup` only discovers datasets:

- nothing is requested until the group is expanded in the Explorer;
- each expansion loads one Registry page:
  `api/v0/registry/records?aspect=dcat-dataset-strings&limit=50`, same-origin
  and unproxied, so the Registry applies the viewer's own read permissions;
- each record becomes a `magda-item` with `datasetId` and the deterministic ID
  `magda-data-catalog/dataset/<encoded record ID>`, resolved by the rules above
  only when the user adds it;
- when the Registry reports more records, a lazy "More datasets…" group loads
  the next page with `pageToken`.

The deprecated upstream `magda` type is not registered. See the
[design](design/full-map-magda-catalog-design.md).

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
