// Custom logging functions that write to stderr instead of stdout to avoid being captured
// ANSI color codes for styling
const COLORS = {
  GRAY: "\x1b[90m", // Bright black (gray)
  RESET: "\x1b[0m", // Reset to default
};

export const logger = {
  info: ({ header, body }: { header: string; body?: string }) => {
    process.stderr.write(
      `[INFO][mcp-server] ${header} ${
        body ? `\n${COLORS.GRAY}${body}${COLORS.RESET}` : ""
      }\n`
    );
  },
  debug: ({ header, body }: { header: string; body?: string }) =>
    process.stderr.write(
      `[DEBUG][mcp-server] ${header} ${
        body ? `\n${COLORS.GRAY}${body}${COLORS.RESET}` : ""
      }\n`
    ),
  warn: ({ header, body }: { header: string; body?: string }) =>
    process.stderr.write(
      `[WARN][mcp-server] ${header} ${
        body ? `\n${COLORS.GRAY}${body}${COLORS.RESET}` : ""
      }\n`
    ),
  error: ({ header, body }: { header: string; body?: string }) =>
    process.stderr.write(
      `[ERROR][mcp-server] ${header} ${
        body ? `\n${COLORS.GRAY}${body}${COLORS.RESET}` : ""
      }\n`
    ),
  log: ({ header, body }: { header: string; body?: string }) =>
    process.stderr.write(
      `[LOG][mcp-server] ${header} ${
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
  requestTimeout: 30000,
  extendedTimeout: 60000,
};
