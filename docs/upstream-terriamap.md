# TerriaMap upstream foundation

The application and build foundation is based on
[TerriaMap v0.4.8](https://github.com/TerriaJS/TerriaMap/tree/v0.4.8), commit
`6e6de6ed4133e401901ed3cb9c3fc68d4123d66c`.

The following areas intentionally remain mechanically aligned with that tag:

- `entry.js` and the asynchronous bootstrap in `index.js`;
- the active Webpack 5/Gulp build process and `gulpfile.js`;
- `lib/Core/`, `lib/Styles/`, and the upstream-derived `lib/Views/` files;
- `plugins.ts`, `tsconfig.json`, and `types/`;
- `wwwroot/index.ejs`, base assets, language files, and `init/simple.json`;
- the TerriaJS 8.13, React 18, Webpack 5, and Sass dependency stack.

## Local differences

- `package.json` retains Magda package identity, compatibility tests, and Helm
  tooling.
- `wwwroot/config.json` retains the Magda application name and support email;
  `wwwroot/init/simple.json` is reduced to the preview camera, viewer, and free
  upstream basemaps rather than TerriaMap's demo catalog.
- `index.js` calls `registerMagdaCatalogMembers(terria)` after native TerriaJS
  model registration, enables compact iframe preview mode, and installs the
  secure parent-message lifecycle bridge.
- `lib/Models/MagdaPreviewReference.ts` and its small companion modules are the
  compatibility seam for the unchanged Magda `magda-item` payload. Data loading
  remains delegated to native TerriaJS 8 catalog models.
- The legacy caller's `baseMapName: "Positron (Light)"` selects an explicitly
  configured replacement of that name when available. Otherwise it selects the
  configured free default, currently OpenStreetMap. No Carto service is required
  by the default runtime path.
- The Node 24 production image, `terriajs-server` 5 wrapper, active Helm chart
  (`apiVersion: v2`), and release workflows are Magda deployment integrations.

The frozen TerriaJS 6 characterization implementation and unused NationalMap
static data, UI, AWS, Helm 2/Tiller, Varnish, and helper-script residue were
removed after the adapter became the test subject. Current 404/500 pages are the
self-contained upstream v0.4.8 pages.

Future changes to upstream-derived files should be kept minimal and documented
here so upgrades can be reviewed as diffs from the tagged TerriaMap application.
