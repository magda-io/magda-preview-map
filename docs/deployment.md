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

## Verification and releases

CI uses Node 22 for application tooling, runs unit/compatibility/server tests,
builds production assets, runs the Playwright iframe protocol tests, lints and
renders Helm, and builds the Node 24 image.

Published GitHub releases build and publish the same image to GHCR and the
existing `data61/magda-preview-map` Docker Hub repository, then publish the Helm
chart to the existing `magda-charts` S3 repository. The release tag (without a
leading `v`) must match the chart version.
