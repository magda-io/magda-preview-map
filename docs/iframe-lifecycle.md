# Magda iframe lifecycle

The preview map preserves the message protocol used by the unchanged Magda web
client while retaining exact-origin validation for inbound start data.

## Protocol

1. The preview registers its message listener and sends `"ready"`.
2. The parent sends the Terria init-source object containing `type:
   "magda-item"`.
3. The compatibility reference resolves and TerriaJS adds the final native item
   to the Workbench. `Workbench.add` completes metadata and map-item loading.
4. The preview sends exactly one terminal message for that generation:
   `"loading complete"`, or a JSON string containing `type`, `title`, and
   `message` for an error.

Application bootstrap does not emit `"loading complete"`. A later accepted
`magda-item` message resets the lifecycle generation; completion from an older
in-flight request is ignored.

## Built-in full map

The same application also serves Magda's built-in **Open full map** view
([#53](https://github.com/magda-io/magda-preview-map/issues/53)); there is no
separate full-map bundle.

| Entry | URL | Chrome |
| --- | --- | --- |
| Compact preview | `<previewMapBaseUrl>#mode=preview&hideExplorerPanel=1` in an iframe | map only (`configurePreviewMode`) |
| Full map | `<previewMapBaseUrl>` (any `mode` other than `preview`) in a new window | full TerriaJS UI: workbench, Explorer / Add data, tools |

The full map uses the same protocol, with `window.opener` in place of the
iframe parent:

1. The Magda web client opens `previewMapBaseUrl` with `window.open` and keeps
   the returned window reference.
2. The full map sends `"ready"` to its opener.
3. The web client checks that the message came from that window and from the
   preview map's origin, then posts the **same** `magda-item` start data as the
   embedded preview (including the Storage API URL, bucket, and any selected
   WMS layer or WFS feature type), addressed to that exact origin.
4. The item is auto-enabled and zoomed, and the full map sends the terminal
   `"loading complete"` or error message to the opener.

A top-level window is its own `parent`, so only the opener is trusted and
messaged. Because Magda serves the preview map same-origin (under
`/preview-map/`), no `parentMessageAllowedOrigins` entry is required.

## Parent origins

The preview accepts messages only when both conditions hold:

- `event.source` is the actual parent or opener window; and
- `event.origin` is the preview's own origin or an exact origin listed in
  `parameters.parentMessageAllowedOrigins`.

`"*"`, opaque `"null"` origins, malformed origins, and configured values with
paths are ignored. Outbound lifecycle messages also use explicit target origins,
not wildcard targets.

For local development on separate ports, add the Magda web-client origin to
`wwwroot/config.json`, for example:

```json
{
  "parameters": {
    "parentMessageAllowedOrigins": ["http://localhost:6108"]
  }
}
```

The Helm chart exposes this value without requiring an image rebuild in #31.
