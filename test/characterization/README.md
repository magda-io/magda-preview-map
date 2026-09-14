# Magda preview compatibility characterization

This suite freezes the external contract used by the current Magda web client's
`DataPreviewMap.tsx` before the TerriaMap v0.4.8 migration.

Run it on Node 22+ without installing the obsolete TerriaJS 6 dependency tree:

```bash
node --test test/characterization/*.test.cjs
# or
npm run test:characterization
```

The test driver loads the checked-in TerriaJS 6 `MagdaCatalogItem.js` with small
stubs at dependency boundaries. Contract data lives in
`fixtures/magda-preview-contract.json`; the browser-loadable parent/iframe
protocol harness lives in `harness/`.

For a manual browser check, serve `harness/` from any static server. The default
stub exercises success, `parent.html?scenario=error` exercises failure, and
`parent.html?previewUrl=http://localhost:3001/` targets a running candidate app.
The candidate URL automatically receives the caller's preview hash.

`support/subject.cjs` is the migration seam. Issue #29 can point
`MAGDA_CHARACTERIZATION_SUBJECT` at a compatible TerriaJS 8 driver, or replace
the default driver, while retaining the contract fixtures and assertions.

## Intentional known gap

The current Magda caller sends `defaultBucket`, while the old TerriaJS 6 model
only consumes `datasetBucket`. The legacy driver tests record that observed bug
as TODO while also storing the required target result and precedence:

```text
defaultBucket ?? datasetBucket ?? "magda-datasets"
```

The TerriaJS 8 subject must satisfy the target result; the known-gap allowance
only applies when the subject identifies itself as `legacy-terria6`.

This lightweight suite characterizes payload construction, Registry and format
resolution, Storage API rewriting, selected WMS/WFS members, and the iframe
terminal-state protocol. It does not claim to verify rendering, secure origin
handling, or a real Terria bootstrap; those are covered by later migration
issues and browser smoke tests.
