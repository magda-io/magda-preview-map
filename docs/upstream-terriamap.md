# TerriaMap upstream foundation

The application and build foundation was rebased on
[TerriaMap v0.4.8](https://github.com/TerriaJS/TerriaMap/tree/v0.4.8), commit
`6e6de6ed4133e401901ed3cb9c3fc68d4123d66c`.

The following areas intentionally remain mechanically aligned with that tag:

- `entry.js` and the asynchronous bootstrap in `index.js`;
- `buildprocess/` and `gulpfile.js`;
- `lib/Core/`, `lib/Styles/`, and `lib/Views/`;
- `plugins.ts`, `tsconfig.json`, and `types/`;
- `wwwroot/index.ejs`, the base assets, language files, and `init/simple.json`;
- the TerriaJS 8.13, React 18, Webpack 5, and Sass dependency stack.

## Local differences

- `package.json` retains Magda package identity, test scripts, and Helm tooling.
- `wwwroot/config.json` retains the Magda application name and support email;
  `wwwroot/init/simple.json` is reduced to the preview camera, viewer and upstream
  free basemap settings rather than shipping TerriaMap's demo catalog.
- `index.js` calls `registerMagdaCatalogMembers(terria)` immediately after native
  TerriaJS model registration. This is the single application registration hook
  for the compatibility adapter in issue #29.
- `configurePreviewMode` interprets the legacy `mode=preview` user property,
  hides explorer/menu chrome, and retains the map, zoom and feature-info UI.
- The TerriaJS 6 `MagdaCatalogItem` is isolated under
  `test/characterization/legacy/` solely as the issue #27 characterization
  subject. It is not imported by the production application and will be removed
  when the tests switch to the TerriaJS 8 adapter.
- Existing Docker, Helm, and release configuration is intentionally left for the
  deployment migration in issue #31. The main CI workflow temporarily builds and
  tests the modern application without publishing the obsolete Node 10 image,
  and the incompatible release job is explicitly disabled until #31 replaces it.

Future changes to upstream-derived files should be kept minimal and documented
here so upgrades can be reviewed as diffs from the tagged TerriaMap application.
