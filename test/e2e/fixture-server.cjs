"use strict";

const http = require("node:http");

const host = "127.0.0.1";
const port = 3101;

function send(response, status, type, body) {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": type
  });
  response.end(body);
}

const crossOriginParent = `<!doctype html>
<title>Unconfigured cross-origin parent</title>
<pre id="log">boot</pre>
<iframe id="preview" src="http://127.0.0.1:3001/#mode=preview&hideExplorerPanel=1"></iframe>
<script>
const frame = document.querySelector("#preview");
const log = document.querySelector("#log");
frame.onload = () => {
  log.textContent += "\\niframe loaded";
};
const rejectedStartData = {
  initSources: [{ catalog: [{
    type: "magda-item",
    name: "Rejected cross-origin fixture",
    url: "http://127.0.0.1:3101/",
    storageApiUrl: "http://127.0.0.1:3101/storage/",
    distributionId: "cross-rejected",
    defaultBucket: "magda-datasets",
    isEnabled: true,
    zoomOnEnable: true
  }], corsDomains: ["127.0.0.1"] }]
};
window.rejectedStartAttempts = 0;
window.postRejectedStart = () => {
  window.rejectedStartAttempts += 1;
  frame.contentWindow.postMessage(rejectedStartData, "*");
};
window.addEventListener("message", event => {
  if (event.source === frame.contentWindow) log.textContent += "\\n" + event.data;
});
</script>`;

http
  .createServer((request, response) => {
    if (request.url === "/health") {
      return send(response, 200, "text/plain", "ok");
    }
    if (request.url === "/parent") {
      return send(response, 200, "text/html", crossOriginParent);
    }
    if (request.url?.startsWith("/api/v0/registry/records/success")) {
      return send(
        response,
        200,
        "application/json",
        JSON.stringify({
          id: "success",
          aspects: {
            "dcat-distribution-strings": {
              format: "GeoJSON",
              downloadURL: `http://${host}:${port}/data.geojson`
            }
          }
        })
      );
    }
    if (request.url?.startsWith("/api/v0/registry/records/storage")) {
      return send(
        response,
        200,
        "application/json",
        JSON.stringify({
          id: "storage",
          aspects: {
            "dcat-distribution-strings": {
              format: "GeoJSON",
              downloadURL: "magda://storage-api/storage.geojson"
            }
          }
        })
      );
    }
    if (request.url?.startsWith("/api/v0/registry/records/empty")) {
      return send(
        response,
        200,
        "application/json",
        JSON.stringify({
          id: "empty",
          aspects: {
            "dcat-distribution-strings": {
              format: "GeoJSON",
              downloadURL: `http://${host}:${port}/empty.geojson`
            }
          }
        })
      );
    }
    if (request.url?.startsWith("/api/v0/registry/records/failure")) {
      return send(response, 503, "application/json", "{}");
    }
    if (request.url === "/storage/magda-datasets/storage.geojson") {
      return send(
        response,
        200,
        "application/json",
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { name: "Storage API browser fixture" },
              geometry: { type: "Point", coordinates: [149.13, -35.28] }
            }
          ]
        })
      );
    }
    if (request.url === "/empty.geojson") {
      return send(
        response,
        200,
        "application/json",
        JSON.stringify({ type: "FeatureCollection", features: [] })
      );
    }
    if (request.url === "/data.geojson") {
      return send(
        response,
        200,
        "application/json",
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { name: "Lifecycle browser fixture" },
              geometry: {
                type: "Point",
                coordinates: [144.96, -37.81]
              }
            }
          ]
        })
      );
    }
    send(response, 404, "text/plain", "not found");
  })
  .listen(port, host, () => console.log(`Fixture server on ${host}:${port}`));
