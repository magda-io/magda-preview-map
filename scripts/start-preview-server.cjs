"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const JSON5 = require("json5");

const appRoot = path.resolve(__dirname, "..");
const defaultClientConfigPath =
  process.env.DEFAULT_CLIENT_CONFIG_PATH ||
  path.join(appRoot, "wwwroot", "config.json");
const clientConfigOverridePath = process.env.CLIENT_CONFIG_PATH;
const runtimeClientConfigPath =
  process.env.RUNTIME_CLIENT_CONFIG_PATH ||
  path.join(appRoot, "wwwroot", "config.json");
const serverConfigPath =
  process.env.SERVER_CONFIG_PATH || path.join(appRoot, "serverconfig.json");

function readConfig(filePath) {
  return JSON5.parse(fs.readFileSync(filePath, "utf8"));
}

function mergeConfig(base, override) {
  if (
    !base ||
    !override ||
    Array.isArray(base) ||
    Array.isArray(override) ||
    typeof base !== "object" ||
    typeof override !== "object"
  ) {
    return override;
  }

  const merged = { ...base };
  Object.entries(override).forEach(([key, value]) => {
    merged[key] = key in merged ? mergeConfig(merged[key], value) : value;
  });
  return merged;
}

function main() {
  if (clientConfigOverridePath) {
    const clientConfig = mergeConfig(
      readConfig(defaultClientConfigPath),
      readConfig(clientConfigOverridePath)
    );
    fs.writeFileSync(
      runtimeClientConfigPath,
      `${JSON.stringify(clientConfig, null, 2)}\n`,
      "utf8"
    );
  }

  const executable = path.join(
    appRoot,
    "node_modules",
    ".bin",
    "terriajs-server"
  );
  const server = spawn(executable, ["--config-file", serverConfigPath], {
    cwd: appRoot,
    env: process.env,
    stdio: "inherit"
  });

  const signalHandlers = new Map();
  ["SIGINT", "SIGTERM"].forEach((signal) => {
    const handler = () => server.kill(signal);
    signalHandlers.set(signal, handler);
    process.on(signal, handler);
  });
  const removeSignalHandlers = () => {
    signalHandlers.forEach((handler, signal) => {
      process.removeListener(signal, handler);
    });
  };

  server.on("error", (error) => {
    removeSignalHandlers();
    console.error(error);
    process.exit(1);
  });
  server.on("exit", (code, signal) => {
    removeSignalHandlers();
    const signalExitCodes = { SIGINT: 130, SIGTERM: 143 };
    process.exit(signal ? signalExitCodes[signal] || 1 : (code ?? 1));
  });
}

if (require.main === module) main();

module.exports = { mergeConfig };
