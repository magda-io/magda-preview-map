# Magda preview compatibility characterization

This suite freezes the external contract used by the unchanged Magda web
client's `DataPreviewMap.tsx` across the TerriaMap v0.4.8 migration.

Run it on Node 22+:

```bash
node --test test/characterization/*.test.cjs
# or
yarn test:characterization
```

Contract data lives in `fixtures/magda-preview-contract.json`; the
browser-loadable parent/iframe protocol harness lives in `harness/`. The driver
in `support/terria8-adapter-driver.cjs` exercises the thin TerriaJS 8 adapter at
its dependency boundaries. The frozen TerriaJS 6 implementation was removed
after the adapter became the only production and test subject.

For a manual browser check, serve `harness/` from any static server. The default
stub exercises success, `parent.html?scenario=error` exercises failure, and
`parent.html?previewUrl=http://localhost:3001/` targets a running candidate app.
The candidate URL automatically receives the caller's preview hash.

The suite checks payload construction, Registry and format resolution, Storage
API rewriting, selected WMS/WFS members, and the iframe terminal-state protocol.
The required Storage bucket precedence is:

```text
defaultBucket ?? datasetBucket ?? "magda-datasets"
```

Rendering, secure origin handling, active-listener rejection, and the real
Terria bootstrap are covered by the lifecycle and Playwright suites. The final
upgrade acceptance also includes a smoke test through the real Magda web client.
