"use strict";

const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const port = Number(process.env.MAGDA_WEB_CLIENT_PORT || 3000);
const siteUrl = new URL(process.env.MAGDA_SITE_URL || "https://dev.magda.io/");
const previewMapBaseUrl =
  process.env.PREVIEW_MAP_BASE_URL || "http://127.0.0.1:3001/";
const buildRoot = path.resolve(
  process.env.MAGDA_WEB_CLIENT_BUILD ||
    path.join(__dirname, "../../../magda/magda-web-client/build")
);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

async function clientConfigScript() {
  const response = await fetch(new URL("server-config.js", siteUrl));
  if (!response.ok) {
    throw new Error(`Cannot load Magda server config: HTTP ${response.status}`);
  }
  const script = await response.text();
  const match = script.match(
    /window\.magda_server_config\s*=\s*(\{.*\});?\s*$/s
  );
  if (!match) throw new Error("Cannot parse Magda server-config.js");

  const config = JSON.parse(match[1]);
  for (const [key, value] of Object.entries(config)) {
    if (/Api.*BaseUrl$/.test(key) && typeof value === "string") {
      config[key] = new URL(value, siteUrl).href;
    }
  }
  config.baseUrl = siteUrl.href;
  config.baseExternalUrl = siteUrl.href;
  config.previewMapBaseUrl = previewMapBaseUrl;
  return `window.magda_server_config = ${JSON.stringify(config)};`;
}

async function readBuildFile(urlPath) {
  const requested = decodeURIComponent(urlPath).replace(/^\/+/, "");
  const candidate = path.resolve(buildRoot, requested || "index.html");
  if (!candidate.startsWith(`${buildRoot}${path.sep}`)) return undefined;

  try {
    const stat = await fs.stat(candidate);
    if (stat.isFile())
      return { file: candidate, body: await fs.readFile(candidate) };
  } catch {
    // React routes fall through to the production index below.
  }

  const index = path.join(buildRoot, "index.html");
  return { file: index, body: await fs.readFile(index) };
}

async function main() {
  const configScript = await clientConfigScript();
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://127.0.0.1:${port}`);
      if (url.pathname === "/server-config.js") {
        response.writeHead(200, { "content-type": contentTypes[".js"] });
        response.end(configScript);
        return;
      }

      const result = await readBuildFile(url.pathname);
      if (!result) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      response.writeHead(200, {
        "content-type":
          contentTypes[path.extname(result.file).toLowerCase()] ||
          "application/octet-stream"
      });
      response.end(result.body);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });

  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  console.log(`Magda web client: http://127.0.0.1:${port}`);
  console.log(`Build root: ${buildRoot}`);
  console.log(`Catalog/API site: ${siteUrl.href}`);
  console.log(`Preview map: ${previewMapBaseUrl}`);

  const stop = () => server.close(() => process.exit(0));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
