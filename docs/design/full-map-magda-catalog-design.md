# Built-in full-map and Magda catalog design

Issues: [#53](https://github.com/magda-io/magda-preview-map/issues/53) and [#55](https://github.com/magda-io/magda-preview-map/issues/55)  
Related completed stopgap: [#54](https://github.com/magda-io/magda-preview-map/issues/54)  
Related CSP investigation: [#56](https://github.com/magda-io/magda-preview-map/issues/56)

## Status

This document is the implementation design for the complete path from the **current state** to the intended built-in full-map experience.

Implementation order is mandatory:

1. **Phase 1 — #53: restore the button as “Open full map” and open the built-in `magda-preview-map` in full mode.**
2. **Phase 2 — #55: expose a lazy Magda data catalog inside that full-map view.**

#55 must not be implemented on the assumption that #53 already exists.

For the catalog portion, **do not implement it by registering TerriaJS's deprecated `MagdaReference` as a registry-root group.** The recommended implementation is a small local, lazy `magda-catalog-group` model. It lists Magda dataset records from the deployment's Registry API and creates child references using the existing `MagdaPreviewReference` / `magda-item` compatibility layer.

The catalog group is injected only into the built-in full-map start data. It is not enabled in compact preview mode and is not added to the workbench. The originally opened dataset continues to auto-load and zoom.

## Goals

1. Reintroduce the currently hidden button as **“Open full map”** when no external TerriaMap target is configured.
2. Open the same `magda-preview-map` application without compact preview chrome and pass the currently previewed dataset to it.
3. Preserve the explicitly configured external-TerriaMap path for operators who use one.
4. Make the deployment's Magda datasets visible in Terria's full-view Explorer / Add Data UI.
5. Let a user add a second Magda dataset while keeping the dataset that opened the full map loaded.
6. Reuse the current `magda-item` resolution path for WMS, WFS, Esri, GeoJSON, CSV, KML/KMZ, and other formats already supported by the preview adapter.
7. Keep initial full-map rendering independent of catalog size.
8. Respect Magda Registry authorization: anonymous users see only records they can read; signed-in users see records allowed by their session.
9. Work for same-origin Magda deployments, including non-root deployments already handled by the `magda-item` base-URL logic.

## Non-goals

This work should not:

- replace the existing `magda-item` contract;
- change the compact embedded preview;
- remove the configured external-TerriaMap compatibility path;
- add a second Magda data-loading implementation;
- add client-side access-control rules;
- eagerly materialize the whole Magda catalog;
- implement a new Terria-wide remote search provider;
- broaden CSP for unrelated full-map features (tracked by #56).

## Current state before implementation

### #54 is already complete

The former `nationalmap.gov.au` fallback has already been removed. In the current Magda web client, `DataPreviewMapOpenInNationalMapButton` renders only when `openInExternalTerriaMapTargetUrl` resolves to a configured external target.

Therefore the default current behavior is:

```text
openInExternalTerriaMapTargetUrl empty
        |
        v
button hidden
```

#53 must deliberately reverse that stopgap behavior:

```text
openInExternalTerriaMapTargetUrl empty
        |
        v
show "Open full map"
        |
        v
open config.previewMapBaseUrl in full mode
```

When `openInExternalTerriaMapTargetUrl` is configured, retain the current external path.

### The preview-map side is already capable of full mode

`configurePreviewMode.ts` only hides Terria chrome when:

```text
mode=preview
```

When that user property is absent (or an explicit non-preview mode is used), the same application retains normal Terria chrome, including workbench and Explorer.

This means #53 does **not** require a second application or bundle.

### The opener lifecycle support is already present

`MagdaPreviewLifecycle` currently:

- posts outbound lifecycle messages to both `window.parent` and `window.opener`;
- accepts start data from either parent or opener when source and origin checks pass;
- sends `"ready"`;
- sends `"loading complete"` after the `magda-item` load completes;
- sends the existing JSON error payload on terminal failure.

For the built-in same-origin path, the preview-map implementation should mainly add regression tests and any small hardening required by those tests rather than inventing a second handshake.

## Phase 1 — implement #53: built-in “Open full map”

### Web-client behavior

The bulk of #53 belongs in the Magda web client.

Update `DataPreviewMapOpenInNationalMapButton.tsx` so the button has two explicit modes:

| Configuration | Button behavior |
| --- | --- |
| `openInExternalTerriaMapTargetUrl` empty | show **Open full map** and open the built-in `previewMapBaseUrl` |
| `openInExternalTerriaMapTargetUrl` set | preserve the current external-TerriaMap behavior |

The button must no longer derive visibility from `!!externalTargetUrl`. It should remain subject to the existing browser-support and caller-level hide conditions.

The existing Storage API “hide button” behavior in `DataPreviewMap.tsx` is not changed by #53 unless separately agreed.

### Built-in target URL

For the built-in path, open:

```text
config.previewMapBaseUrl
```

without `mode=preview`.

An explicit `#mode=full` may be used if desired for readability, but it is not required by current `configurePreviewMode`: anything other than `mode=preview` leaves full Terria chrome available.

Do not open the embedded URL:

```text
#mode=preview&hideExplorerPanel=1
```

because that intentionally hides the UI required by #53/#55.

### Reuse the embedded `magda-item` payload

The built-in path must send the **same Magda-specific payload shape used by the embedded preview**, not the legacy external Terria payload.

Today the embedded `DataPreviewMapTerria.createCatalogItemFromDistribution(...)` includes important fields such as:

```text
type: magda-item
url
storageApiUrl
distributionId
defaultBucket
isEnabled
zoomOnEnable
selectedWmsLayerName / selectedWfsFeatureTypeName
homeCamera
```

By contrast, `DataPreviewMapOpenInNationalMapButton.createCatalogItemFromDistribution()` currently builds external-target payloads and should not become the source of truth for the built-in path.

Recommended refactor in the Magda web client:

```text
createMagdaPreviewStartData(distribution, selected WMS/WFS choice)
        |
        +-- embedded iframe preview
        |
        +-- built-in full-map opener
```

Keep the legacy external payload builder separate.

This avoids the embedded preview and full-map button drifting in storage URL, bucket, WMS/WFS selection, basemap, or future compatibility fields.

### Selected WMS/WFS member

The button component currently receives only the distribution. The embedded preview wrapper owns the selected WMS/WFS layer/feature-type state.

For the built-in full map to render *identically* to the embedded preview, pass that selected value into the button (or pass already-built start data) so the built-in payload contains:

```text
selectedWmsLayerName
```

or:

```text
selectedWfsFeatureTypeName
```

when applicable.

Do not silently fall back to a different member merely because the user opened the full view.

### Opener handshake

Built-in flow:

```text
dataset page
    |
    | user clicks Open full map
    v
window.open(previewMapBaseUrl)
    |
    | full map -> opener: "ready"
    v
web client
    |
    | opener -> full map: embedded-equivalent magda-item start data
    v
MagdaPreviewLifecycle
    |
    | updateFromStartData
    | magda-item resolves and enters workbench
    v
full Terria map
```

Keep the popup reference and require incoming `"ready"` to come from that exact window.

For the built-in path, prefer a concrete target origin derived from `previewMapBaseUrl` rather than `"*"`. The external legacy path can retain its existing compatibility behavior unless changed separately.

### Button text and popup handling

Default built-in label:

```text
Open full map
```

`openInExternalTerriaMapButtonText` continues to override the label in both modes.

The popup-blocked message should be generic to “full map” / “map” rather than naming the discontinued NationalMap service.

### Preview-map responsibilities for #53

In `magda-preview-map`:

- retain full Terria chrome whenever `mode=preview` is not selected;
- retain the existing opener source/origin validation;
- retain `ready` / `loading complete` / error semantics;
- add explicit tests for the same-origin opener path;
- document the built-in full-map entry contract.

Do not add a separate “full map application”.

### #53 acceptance criteria

- [ ] With no external target configured, the button is visible and defaults to “Open full map”.
- [ ] Clicking it opens `previewMapBaseUrl` without compact preview mode.
- [ ] Full Terria chrome is visible.
- [ ] The current dataset is transferred by the opener handshake and is auto-enabled and zoomed.
- [ ] The built-in payload includes the same Storage API/bucket settings as the embedded preview.
- [ ] The selected WMS layer or WFS feature type is preserved.
- [ ] `openInExternalTerriaMapTargetUrl` still selects the legacy external path.
- [ ] `openInExternalTerriaMapButtonText` overrides the label in both paths.
- [ ] Popup blocking is handled gracefully.
- [ ] Compact iframe preview behavior is unchanged.

## Investigation findings

### The current app already has the right item-level compatibility seam

`MagdaPreviewReference` is registered locally as:

```text
magda-item
```

It already supports both:

- `distributionId`: load one Registry distribution record; and
- `datasetId`: load a dataset's dereferenced `dataset-distributions` and resolve a compatible native TerriaJS item.

It also already carries the deployment-specific values needed by catalog children:

- Magda base `url`;
- `storageApiUrl`;
- `defaultBucket` / legacy `datasetBucket`.

This makes it a better child reference for the new catalog than introducing another Magda reference implementation.

### TerriaJS 8.13 does not provide a registry-root Magda catalog group

TerriaJS 8.13 contains `MagdaReference` with:

```ts
static readonly type = "magda";
```

but there are two important limitations for #55:

1. it is explicitly deprecated upstream; and
2. it references a **specific Magda Registry record** via `recordId`.

It can turn a Registry record containing a dereferenced `group.members` aspect into a Terria group, but it does not enumerate all dataset records in a Magda instance merely from a Registry base URL.

A configuration such as:

```json
{
  "type": "magda",
  "url": "/"
}
```

is therefore **not** a Magda catalog root.

There is also no `magda-group` registered by the normal TerriaJS 8.13 `registerCatalogMembers()` path. Registering `MagdaReference` locally would still not solve catalog discovery unless the Magda deployment maintained a special root group record containing every desired dataset.

### Registry API is suitable for lazy catalog enumeration

Magda's Registry API supports listing dataset records with:

```text
GET <magda-base>/api/v0/registry/records
    ?aspect=dcat-dataset-strings
    &limit=<page-size>
    [&pageToken=<next-page-token>]
```

The response provides `records`, `hasMore`, and `nextPageToken`.

Magda's own API guidance recommends `pageToken` pagination rather than large `start` offsets for walking Registry records.

The Registry read route obtains an `object/record/read` authorization decision before querying records, so the API—not this UI—remains responsible for deciding which dataset records are visible.

### Catalog metadata should use the same-origin Magda API directly

For the #53 built-in full-map flow, the preview-map application and Magda gateway are same-origin. Requests to the Magda Registry should therefore resolve against the Magda gateway base URL and remain same-origin.

Do not deliberately route user-specific catalog metadata through the Terria server proxy. The browser's same-origin request is the path that naturally carries the user's Magda session and lets the gateway/Registry perform the correct access-control filtering.

Terria's data-source models may continue to use `proxyCatalogItemUrl` where appropriate for external WMS/WFS/Esri/file resources.

## End-to-end architecture

```text
Magda dataset page
        |
        | Open full map (#53)
        v
built-in magda-preview-map, full Terria mode
        |
        | opener handshake sends existing magda-item start data
        v
original dataset loads + zooms
        |
        | full-mode start-data augmentation (#55)
        v
lazy Magda catalog root appears in Explorer
        |
        | user expands / selects another dataset
        v
second MagdaPreviewReference resolves to native Terria model
```

The two issues are sequential but share one start-data path. #53 establishes the full-view entry point and opener payload; #55 augments that same payload on the preview-map side.

## Proposed catalog architecture (#55)

```text
Magda web client
    |
    | #53 opener handshake
    | existing start data containing type: "magda-item"
    v
MagdaPreviewLifecycle
    |
    | full mode only:
    | augment start data with one magda-catalog-group
    | using URL/storage/bucket values copied from magda-item
    v
Terria full UI
    |
    +-- existing magda-item ----------------------+
    |       auto-enabled / zoomed                 |
    |                                             v
    |                                   native Terria map item
    |
    +-- MagdaCatalogGroup (not enabled)
            |
            | only when Explorer group is expanded
            v
       Registry dataset page
            |
            +-- MagdaPreviewReference(datasetId=...)
            +-- MagdaPreviewReference(datasetId=...)
            +-- ...
            +-- "More datasets..." page group
                    |
                    | only when expanded
                    v
               next Registry page
```

The important separation is:

- **catalog discovery** belongs to `MagdaCatalogGroup`;
- **dataset/distribution resolution and rendering** remains in `MagdaPreviewReference` and native TerriaJS models.

## Full-mode start-data augmentation

### Why inject from the incoming `magda-item`

Do not hard-code the catalog root in `wwwroot/init/simple.json`.

The existing Magda caller already sends the correct deployment-specific values in its `magda-item`:

```json
{
  "type": "magda-item",
  "url": "...",
  "storageApiUrl": "...",
  "defaultBucket": "..."
}
```

These values can differ for:

- a root deployment;
- a non-root deployment;
- a locally hosted Magda instance;
- deployments with a non-default Storage API URL or dataset bucket.

Reusing them avoids introducing another deployment URL configuration path and preserves the fixes already made for relative/non-root Magda URLs.

### Proposed augmentation

Add a small pure helper, for example:

```text
augmentStartDataWithMagdaCatalog(terria, startData)
```

Call it from the parent/opener message handling path immediately before `terria.updateFromStartData(...)`.

Rules:

1. If `terria.userProperties.get("mode") === "preview"`, return the start data unchanged.
2. Find the first incoming catalog item with `type === "magda-item"`.
3. If no such item exists, return unchanged.
4. If a `magda-catalog-group` with the fixed catalog root ID already exists in the start data, do not duplicate it.
5. Append a catalog member similar to:

```json
{
  "id": "magda-data-catalog",
  "type": "magda-catalog-group",
  "name": "Magda data catalog",
  "url": "<copied from magda-item>",
  "storageApiUrl": "<copied from magda-item>",
  "defaultBucket": "<copied from magda-item>",
  "datasetBucket": "<legacy fallback if required>",
  "pageSize": 50
}
```

The group must **not** contain `isEnabled`, `zoomOnEnable`, or any workbench entry.

Using a fixed root ID means subsequent start-data updates update/reuse the same catalog root rather than creating duplicates.

### Interaction with lifecycle completion

`MagdaPreviewLifecycle` currently treats `magda-item` loads as the preview generation whose terminal state produces `"loading complete"` or an error message.

The new catalog group must not become part of that terminal-load calculation.

Because the group is lazy and is not enabled, it must perform no Registry list request as part of the initial full-map load. The original `magda-item` remains the only initial dataset that affects the #53 opener loading flow.

## New catalog model

### Type

Add:

```text
magda-catalog-group
```

Suggested files:

```text
lib/Models/MagdaCatalogGroup.ts
lib/Traits/MagdaCatalogGroupTraits.ts
```

Register it beside `MagdaPreviewReference` in:

```text
lib/Models/registerMagdaCatalogMembers.ts
```

Do **not** register upstream `MagdaReference` / `type: "magda"` as part of this issue.

### Model shape

Follow the normal TerriaJS group pattern:

```ts
UrlMixin(
  GroupMixin(
    CatalogMemberMixin(
      CreateModel(MagdaCatalogGroupTraits)
    )
  )
)
```

Exact mixin composition should follow the minimum required by TerriaJS 8.13 and the existing native group implementations.

Suggested traits:

| Trait | Purpose |
| --- | --- |
| `url` | Magda gateway base copied from the launch `magda-item` |
| `storageApiUrl` | Passed to child `MagdaPreviewReference` models |
| `defaultBucket` | Current Storage API dataset bucket |
| `datasetBucket` | Legacy bucket alias if present |
| `pageSize` | Number of Registry records per lazy page; default 50 |
| `pageToken` | Internal token for continuation page groups |
| `rootCatalogId` | Optional stable root ID used to create deterministic child IDs |

The continuation-only traits do not need to become a public external contract; they are implementation details of this application.

### Loading behavior

`forceLoadMetadata` should not enumerate datasets.

`forceLoadMembers` should load exactly one Registry page.

Conceptually:

```text
resolve Magda base URL
        |
        v
GET api/v0/registry/records
  ?aspect=dcat-dataset-strings
  &limit=50
  [&pageToken=...]
        |
        v
create/reuse one MagdaPreviewReference per returned dataset
        |
        +-- if hasMore:
                create one lazy continuation group carrying nextPageToken
```

This gives bounded work per Explorer expansion and ensures the initial map startup performs zero catalog-list requests.

### Registry URL construction

Extract/reuse the same base-resolution rule already used by `buildRegistryRecordUrl`.

Do not reintroduce the bug fixed in #51 by passing a relative `"/"` directly as the base to `new URL(...)`.

A shared helper should support:

- absolute Magda base URL;
- root-relative `/`;
- path-prefixed Magda base such as `/some-prefix/`.

Build the list endpoint relative to that resolved base:

```text
api/v0/registry/records
```

### Page size and continuation UX

Default:

```text
pageSize = 50
```

If the response says `hasMore: true`, append a continuation group named:

```text
More datasets…
```

That group's `pageToken` is the response's `nextPageToken`. Expanding it loads only the next page and may create another continuation group.

This is intentionally simple. It avoids:

- loading thousands of models at once;
- relying on slow Registry offset pagination;
- the Search API's 10,000-result browsing limit;
- a custom infinite-scroll UI inside Terria's Explorer.

A future enhancement can replace the continuation-group UX with a remote catalog search provider without changing the child item model.

## Child dataset references

For each Registry record:

1. derive display name from `dcat-dataset-strings.title`, falling back to the Registry record `name`, then record ID;
2. create or reuse one `MagdaPreviewReference`;
3. use a deterministic ID such as:

```text
magda-data-catalog/dataset/<encoded-record-id>
```

4. set:

```text
url
datasetId
storageApiUrl
defaultBucket / datasetBucket
name
isMappable = true
```

5. do not set `isEnabled` or `zoomOnEnable`.

`CatalogMemberReferenceTraits` already provides the `isMappable` hint. The actual target type remains unknown until the user tries to add the dataset, which is normal for a reference model.

When the user adds the reference, existing `MagdaPreviewReference.forceLoadReference()` performs the dataset Registry lookup, resolves a supported distribution, creates a native TerriaJS target, and the normal workbench flow renders it.

## Dataset distribution selection

The current `datasetId` compatibility path chooses the first compatible distribution returned from `dataset-distributions`.

For catalog browsing, make this deterministic and align it with the Magda web client's current preview preference where practical.

Recommended ranking:

1. WMS
2. Esri MapServer
3. WFS
4. Esri FeatureServer
5. GeoJSON
6. geographic CSV
7. KML/KMZ
8. CZML, if retained

Keep the existing URL sanity checks, including not treating SceneServer URLs as WMS/WFS and requiring MapServer/FeatureServer URL evidence for generic Esri labels.

Implement the ranking in shared compatibility code rather than in the group itself, so:

- direct `distributionId` behavior remains unchanged;
- dataset-level `MagdaPreviewReference` resolution becomes predictable;
- the catalog group does not duplicate format-to-Terria mapping logic.

A dataset with no supported distribution may still be listed because the first catalog page intentionally fetches only lightweight dataset metadata. If the user adds such a dataset, surface the existing clear "no compatible distributions" error.

Do not dereference every dataset's distributions merely to hide unsupported records; that would defeat the lazy catalog design.

## Access control and session handling

Access control is a server responsibility.

The catalog group must:

- call the Magda Registry list endpoint through the user's same-origin browser session;
- rely on Registry's `object/record/read` authorization filtering;
- never attempt to reconstruct access-control rules from record aspects;
- never embed a privileged Magda session/header in client configuration;
- never cache one user's authorized catalog response in a shared server-side cache.

Anonymous use should naturally return the anonymous-visible record set. A signed-in user's browser session should naturally return that user's visible records.

If the user's permissions change while a full-map window remains open, refreshing/reopening the catalog is sufficient for this phase; live permission-change subscription is out of scope.

## Same-origin and proxy behavior

The built-in full-map feature in #53 is specifically a same-origin Magda experience.

Catalog metadata requests should therefore target the deployment's Magda API directly, for example:

```text
https://example.test/api/v0/registry/records?...
```

or the equivalent prefixed path.

This has three advantages:

1. browser same-origin credentials are available;
2. `connect-src 'self'` is sufficient for the catalog request;
3. a Terria server proxy does not need to reproduce Magda user-session behavior.

This does **not** change how the resolved dataset itself is loaded. Native Terria models may proxy external service URLs according to the existing TerriaJS/server policy.

## CSP impact

The catalog feature itself should not require a broader CSP:

- Registry list requests: same origin;
- per-item Registry requests: same origin;
- Storage API for Magda-hosted files: same origin in the normal deployment.

Therefore #55 should not expand CSP as part of its implementation.

Full-view features that contact additional hosts, plus external dataset rendering behavior that cannot be handled through the existing Terria proxy, remain under #56.

## Error handling

### Catalog list failure

If a Registry page fails:

- show the normal Terria group load error for that group/page;
- keep the original workbench item and map usable;
- do not emit the legacy preview terminal error for the already-loaded original dataset.

### Dataset resolution failure

If a selected catalog dataset has no supported distribution or its source is unavailable:

- let `MagdaPreviewReference` return its existing actionable Terria error;
- do not remove or reset the original workbench item.

### Partial pagination failure

If page 1 loaded and a later "More datasets…" group fails, the already-loaded pages remain usable.

## Model identity and duplicate handling

Use deterministic IDs based on the Magda dataset record ID, independent of Registry page boundaries.

This ensures:

- reloading a page reuses the same model;
- the same dataset cannot become multiple catalog models merely because pagination changed;
- continuation groups can safely be reconstructed.

Before creating a child, check `terria.getModelById(...)` and reuse an existing `MagdaPreviewReference` where appropriate.

The initially opened item is normally a distribution-level `magda-item`, while the catalog entry is dataset-level. They may therefore coexist. Adding the containing dataset again is allowed in this first implementation; deduplicating it against the original distribution is not required by #55.

## Phase 2 — implement #55: Magda catalog

### Suggested implementation changes

### 1. Add traits and group model

Add:

```text
lib/Traits/MagdaCatalogGroupTraits.ts
lib/Models/MagdaCatalogGroup.ts
```

Include one-page Registry loading, deterministic child creation, and lazy continuation groups.

### 2. Register the new local type

Update:

```text
lib/Models/registerMagdaCatalogMembers.ts
```

to register both:

```text
magda-item
magda-catalog-group
```

Do not register upstream `magda`.

### 3. Share Magda base URL helpers

Refactor the relative/absolute base resolution currently used by `buildRegistryRecordUrl` so the catalog list URL and item record URL cannot diverge.

Keep regression coverage for the root-relative and non-root cases from #51.

### 4. Add full-mode start-data augmentation

Add a pure helper, suggested location:

```text
lib/Models/addMagdaCatalogToStartData.ts
```

or another small module near `MagdaPreviewLifecycle`.

Invoke it only for incoming parent/opener start data and only when not in `mode=preview`.

The helper copies the Magda base, Storage API URL, and bucket settings from the incoming `magda-item`.

### 5. Make dataset-level format choice deterministic

Update shared `magdaPreviewCompatibility` logic so `datasetId` resolution follows the documented preview-format preference rather than Registry member order.

This is exercised only when resolving a dataset-level reference; direct `distributionId` loads remain exact.

### 6. Add tests

Suggested test area:

```text
test/catalog/
```

Keep the existing adapter/characterization suites intact.

## Test plan

### Pure/unit tests

Cover:

- `magda-catalog-group` registration;
- absolute Magda base URL;
- relative `/` base URL;
- non-root base URL;
- Registry list URL contains `aspect=dcat-dataset-strings`;
- first page has no `pageToken`;
- continuation page uses the returned `nextPageToken`;
- default page size is bounded;
- record title fallback rules;
- child IDs are deterministic;
- child references inherit URL/storage/bucket values;
- child references use `datasetId`;
- children are not auto-enabled;
- unsupported dataset records do not trigger eager distribution requests;
- deterministic dataset distribution preference.

### Lifecycle/start-data tests

Cover:

- preview mode: no catalog group is injected;
- full mode + `magda-item`: exactly one catalog group is injected;
- repeated start data does not duplicate the root;
- no `magda-item`: no group is injected;
- the injected group inherits the exact deployment values from the source item;
- adding the lazy group does not change the `magda-item` generation-completion rules.

### Integration test with mocked Magda APIs

1. start the app in full mode;
2. send #53-style opener start data;
3. verify the original dataset loads and reaches the workbench;
4. verify **no catalog-list request occurs before the group is expanded**;
5. expand "Magda data catalog";
6. return a Registry page with two datasets and `hasMore: true`;
7. verify two dataset references plus "More datasets…" appear;
8. add one dataset;
9. verify its existing `MagdaPreviewReference` path resolves and a second native map item reaches the workbench;
10. expand "More datasets…" and verify the next request carries `pageToken`.

### Access-control deployment test

In a real Magda deployment:

- anonymous full map must not reveal a known restricted dataset;
- an authorized signed-in user should see that dataset;
- adding it should use the same session and load only if authorized.

Do not simulate access control by filtering titles/IDs in the client.

### Regression test for the original item

Opening the full map from a dataset page must still result in:

- original `magda-item` auto-enabled;
- original item zoom behavior preserved;
- catalog root not in the workbench;
- second item add/remove does not remove the original item.

## Cross-repository delivery sequence

The recommended handoff sequence is:

1. **Magda web client — #53**
   - re-enable the button for the default built-in path;
   - refactor/reuse embedded `magda-item` start-data construction;
   - preserve selected WMS/WFS choice;
   - open `previewMapBaseUrl` in full mode;
   - preserve configured external-TerriaMap behavior.
2. **magda-preview-map — #53 validation/hardening**
   - test full chrome outside preview mode;
   - test same-origin opener handshake and terminal lifecycle.
3. **magda-preview-map — #55**
   - register and implement lazy `magda-catalog-group`;
   - augment only full-mode incoming `magda-item` start data;
   - reuse `MagdaPreviewReference` children.
4. **Integration**
   - run the real Magda web client against the built-in full map;
   - verify original + second dataset behavior;
   - verify anonymous/authenticated catalog visibility.
5. **CSP follow-up**
   - handle additional full-view feature requirements under #56 rather than broadening policy speculatively in #53/#55.

An implementation agent should not start with the catalog and assume an existing opener UI.

## Acceptance criteria for #55

The implementation is complete when all of the following are true:

- [ ] Full-map mode launched through the #53 handshake contains a "Magda data catalog" group in Explorer.
- [ ] Compact `#mode=preview` behavior is unchanged.
- [ ] Expanding the catalog performs the first catalog-list request; merely opening the full map does not.
- [ ] Catalog enumeration uses bounded Registry pages and `nextPageToken` continuation.
- [ ] A user can add a second supported Magda dataset and render it alongside the originally opened dataset.
- [ ] The original dataset still auto-loads and zooms.
- [ ] Catalog children reuse `MagdaPreviewReference` rather than a separate loader.
- [ ] Upstream deprecated TerriaJS `MagdaReference` is not made a new application dependency/contract.
- [ ] Anonymous and authenticated visibility is determined by the Magda Registry authorization response.
- [ ] Root-relative and non-root Magda deployments are covered by automated tests.
- [ ] Catalog loading does not require a CSP expansion beyond same-origin API access.

## Implementation notes for the next agent

The main trap in this issue is assuming that TerriaJS has a native `magda-group` that can be pointed at `/api/v0/registry`. In TerriaJS 8.13 it does not.

Use the current local adapter as the item-level primitive and keep the new model narrow:

```text
MagdaCatalogGroup = discover dataset IDs lazily
MagdaPreviewReference = resolve one dataset/distribution
TerriaJS native model = load/render the actual geospatial source
```

This keeps ownership clear and minimizes the amount of Magda-specific code that depends on TerriaJS internals.
