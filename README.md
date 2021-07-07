# magda-preview-map

![Version: 1.0.1](https://img.shields.io/badge/Version-1.0.1-informational?style=flat-square)

A Helm chart for Magda Preview Map module - forked from Terria Map Repo

See the [TerriaJS README](https://github.com/TerriaJS/TerriaJS) or [TerriaMap Repo](https://github.com/TerriaJS/TerriaMap) for more information.

**Homepage:** <https://github.com/magda-io/magda-preview-map>

## Source Code

* <https://github.com/magda-io/magda-preview-map>

## Requirements

Kubernetes: `>= 1.14.0-0`

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| autoscaler.enabled | bool | `false` |  |
| autoscaler.maxReplicas | int | `3` |  |
| autoscaler.minReplicas | int | `1` |  |
| autoscaler.targetCPUUtilizationPercentage | int | `80` |  |
| defaultImage.imagePullSecret | bool | `false` |  |
| defaultImage.pullPolicy | string | `"IfNotPresent"` |  |
| defaultImage.repository | string | `"docker.io/data61"` |  |
| global.image | object | `{}` |  |
| global.rollingUpdate | object | `{}` |  |
| image.name | string | `"magda-preview-map"` |  |
| replicas | int | `1` | no. of initial replicas of the deployment |
| resources.limits.cpu | string | `"250m"` |  |
| resources.requests.cpu | string | `"50m"` |  |
| resources.requests.memory | string | `"200Mi"` |  |
| serverConfig.allowProxyFor[0] | string | `"nicta.com.au"` |  |
| serverConfig.allowProxyFor[10] | string | `"www.dptiapps.com.au"` |  |
| serverConfig.allowProxyFor[11] | string | `"geoserver-123.aodn.org.au"` |  |
| serverConfig.allowProxyFor[12] | string | `"geoserver.imos.org.au"` |  |
| serverConfig.allowProxyFor[13] | string | `"nci.org.au"` |  |
| serverConfig.allowProxyFor[14] | string | `"static.nationalmap.nicta.com.au"` |  |
| serverConfig.allowProxyFor[15] | string | `"githubusercontent.com"` |  |
| serverConfig.allowProxyFor[16] | string | `"gov"` |  |
| serverConfig.allowProxyFor[17] | string | `"gov.uk"` |  |
| serverConfig.allowProxyFor[18] | string | `"gov.nz"` |  |
| serverConfig.allowProxyFor[19] | string | `"sample.aero3dpro.com.au"` |  |
| serverConfig.allowProxyFor[1] | string | `"gov.au"` |  |
| serverConfig.allowProxyFor[2] | string | `"csiro.au"` |  |
| serverConfig.allowProxyFor[3] | string | `"arcgis.com"` |  |
| serverConfig.allowProxyFor[4] | string | `"argo.jcommops.org"` |  |
| serverConfig.allowProxyFor[5] | string | `"www.abc.net.au"` |  |
| serverConfig.allowProxyFor[6] | string | `"geoserver.aurin.org.au"` |  |
| serverConfig.allowProxyFor[7] | string | `"mapsengine.google.com"` |  |
| serverConfig.allowProxyFor[8] | string | `"s3-ap-southeast-2.amazonaws.com"` |  |
| serverConfig.allowProxyFor[9] | string | `"adelaidecitycouncil.com"` |  |
| serverConfig.port | int | `6110` |  |