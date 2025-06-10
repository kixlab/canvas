// Custom logging functions that write to stderr instead of stdout to avoid being captured
export const logger = {
  info: (message: string) => process.stderr.write(`[INFO] ${message}\n`),
  debug: (message: string) => process.stderr.write(`[DEBUG] ${message}\n`),
  warn: (message: string) => process.stderr.write(`[WARN] ${message}\n`),
  error: (message: string) => process.stderr.write(`[ERROR] ${message}\n`),
  log: (message: string) => process.stderr.write(`[LOG] ${message}\n`),
};

const args = process.argv.slice(2);
const serverArg = args.find((arg) => arg.startsWith("--server="));
export const serverUrl = serverArg ? serverArg.split("=")[1] : "localhost";
export const WS_URL =
  serverUrl === "localhost" ? `ws://${serverUrl}` : `wss://${serverUrl}`;

// Server configuration
export const SERVER_CONFIG = {
  name: "CanvasBenchMCP",
  version: "1.0.0",
  defaultWebSocketPort: 3055,
  reconnectDelay: 2000,
  requestTimeout: 30000,
  extendedTimeout: 60000,
};
