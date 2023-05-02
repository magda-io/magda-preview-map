# CHANGELOG

> The repo was part of [magda main repo](https://github.com/magda-io/magda). For history before v0.0.58, please check [CHANGES.md of main repo](https://github.com/magda-io/magda/blob/master/CHANGES.md).

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