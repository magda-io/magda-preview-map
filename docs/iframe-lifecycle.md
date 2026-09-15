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
