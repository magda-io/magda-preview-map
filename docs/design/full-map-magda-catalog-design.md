# Built-in full-map Magda catalog design

Issue: [#55](https://github.com/magda-io/magda-preview-map/issues/55)  
Parent design: [#53](https://github.com/magda-io/magda-preview-map/issues/53)  
Related CSP investigation: [#56](https://github.com/magda-io/magda-preview-map/issues/56)

## Status

**Decision: pursue the catalog enhancement, but do not implement it by registering TerriaJS's deprecated `MagdaReference` as a registry-root group.**

The recommended implementation is a small local, lazy `magda-catalog-group` model. It lists Magda dataset records from the deployment's Registry API and creates child references using the existing `MagdaPreviewReference` / `magda-item` compatibility layer.

The catalog group is injected only into the **built-in full-map** start data. It is not enabled in compact preview mode and is not added to the workbench. The original dataset continues to auto-load and zoom exactly as it does today.

This design keeps the new functionality inside the existing Magda compatibility seam, avoids depending on a deprecated TerriaJS model, preserves user-specific access control, and avoids loading the catalog during initial map startup.

## Goals

1. Make the deployment's Magda datasets visible in Terria's full-view Explorer / Add Data UI.
2. Let a user add a second Magda dataset while keeping the dataset that opened the full map loaded.
3. Reuse the current `magda-item` resolution path for WMS, WFS, Esri, GeoJSON, CSV, KML/KMZ, and other formats already supported by the preview adapter.
4. Keep initial full-map rendering independent of catalog size.
5. Respect Magda Registry authorization: anonymous users see only records they can read; signed-in users see records allowed by their session.
6. Work for same-origin Magda deployments, including non-root deployments already handled by the `magda-item` base-URL logic.

## Non-goals

This issue should not:

- replace the existing `magda-item` contract;
- change the compact embedded preview;
- add a second Magda data-loading implementation;
- add client-side access-control rules;
- eagerly materialize the whole Magda catalog;
- implement a new Terria-wide remote search provider;
- broaden CSP for unrelated full-map features (tracked by #56);
- change the Magda web-client protocol beyond the #53 full-map handshake.

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

## Proposed architecture

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

## Suggested implementation changes

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
