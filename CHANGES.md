# CHANGELOG

> The repo was part of [magda main repo](https://github.com/magda-io/magda). For history before v0.0.58, please check [CHANGES.md of main repo](https://github.com/magda-io/magda/blob/master/CHANGES.md).

## Unreleased — TerriaMap v0.4.8 / TerriaJS 8

- Rebased the application/build foundation on TerriaMap v0.4.8, TerriaJS 8.13,
  React 18, Webpack 5, Babel 7, TypeScript 5, and Node 22+ tooling.
- Replaced the TerriaJS 6 custom catalog item with a thin `magda-item`
  compatibility reference that delegates WMS, WFS, ArcGIS, GeoJSON, CSV, KML,
  KMZ, and CZML loading to native TerriaJS 8 models.
- Added native ArcGIS FeatureServer root/layer handling without disabling tiled
  PBF or native query/pagination strategies.
- Preserved explicit caller-selected WMS layers and WFS feature types over URL
  selections, Storage bucket precedence, enable/zoom behavior, and terminal
  iframe messages.
- Secured parent messaging with exact origin/source checks and generation-aware,
  awaited completion/error signaling.
- Modernized the Node 24 non-root production image, `terriajs-server` 5 wrapper,
  Helm runtime configuration, CI, and release publishing.
- Replaced the retired Carto `Positron (Light)` default with a deterministic
  fallback to the configured free OpenStreetMap basemap while allowing an
  operator-provided licensed replacement.
- Removed frozen TerriaJS 6 tests and unused NationalMap assets, region data,
  AWS/Helm 2/Varnish deployment stacks, and obsolete helper scripts.

## 1.1.2

- fix broken icon links
- remove unnecessary inline JS code
- clean-up default configs

## 1.1.1

- Related to https://github.com/magda-io/magda/issues/3458, add better WMS / WFS sub layer / typeName support.

## 1.1.0

- Related to https://github.com/magda-io/magda/issues/3229, Use magda-common for docker image related logic
- Fixed: Should not set `replicas` when `autoscaler` is enabled

## 1.0.1

- improve ci scripts & setup helm-docs
- #12 make preview map support format string: "ESRI MapServer" & "ESRI FeatureServer"
- #11 allow MagdaCatalogItem select wms layer by name (by "selectedWmsLayerName")
- #14 Send Error Message back via postMessage in MagdaCatalogItem
- Turned on ESRI Feature Server Support
- #15 Support Select FeatureType for WFS

## 1.0.0

- Allow proxy hosts list configurable via helm chart
- Auto roll deployment when configMap data changes
- Do not set replicas when autoScaler is on

## 0.0.58

- make MagdaCatalogItem compitiable with magda internal storage url
- helm chart will by default use chart version as docker image verison
- Add helm chart docs
