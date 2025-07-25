const COLORS = {
  GRAY: "\x1b[90m",
  SERVER: "\x1b[36m",
  RESET: "\x1b[0m",
  ITALIC: "\x1b[3m",
  ERROR: "\x1b[31m",
};

const SERVER_TAG = `${COLORS.SERVER}[MCP-SERVER]${COLORS.RESET}`;
const INFO_TAG = `[${COLORS.ITALIC}info${COLORS.RESET}]`;
const DEBUG_TAG = `[${COLORS.ITALIC}debug${COLORS.RESET}]`;
const WARN_TAG = `[${COLORS.ITALIC}warn${COLORS.RESET}]`;
const ERROR_TAG = `[${COLORS.ERROR}error${COLORS.RESET}]`;
const LOG_TAG = `[${COLORS.ITALIC}log${COLORS.RESET}]`;

export const logger = {
  info: ({ header, body }: { header: string; body?: string }) =>
    process.stderr.write(
      `${SERVER_TAG}${INFO_TAG} ${header}${
        body ? `\n${COLORS.GRAY}${body}${COLORS.RESET}` : ""
      }\n`
    ),

  debug: ({ header, body }: { header: string; body?: string }) =>
    process.stderr.write(
      `${SERVER_TAG}${DEBUG_TAG} ${header}${
        body ? `\n${COLORS.GRAY}${body}${COLORS.RESET}` : ""
      }\n`
    ),

  warn: ({ header, body }: { header: string; body?: string }) =>
    process.stderr.write(
      `${SERVER_TAG}${WARN_TAG} ${header}${
        body ? `\n${COLORS.GRAY}${body}${COLORS.RESET}` : ""
      }\n`
    ),

  error: ({ header, body }: { header: string; body?: string }) =>
    process.stderr.write(
      `${SERVER_TAG}${ERROR_TAG} ${header}${
        body ? `\n${COLORS.GRAY}${body}${COLORS.RESET}` : ""
      }\n`
    ),

  log: ({ header, body }: { header: string; body?: string }) =>
    process.stderr.write(
      `${SERVER_TAG}${LOG_TAG} ${header}${
        body ? `\n${COLORS.GRAY}${body}${COLORS.RESET}` : ""
      }\n`
    ),
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
  requestTimeout: 120000,
  extendedTimeout: 240000,
};
