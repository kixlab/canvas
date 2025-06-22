import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";

// Custom logging functions that write to stderr instead of stdout to avoid being captured
// ANSI color codes for styling
const COLORS = {
  GRAY: "\x1b[90m", // Bright black (gray)
  RESET: "\x1b[0m", // Reset to default
};

export const logger = {
  info: ({ header, body }: { header: string; body?: string }) => {
    process.stderr.write(
      `[INFO][socket-server] ${header} ${
        body ? `\n${COLORS.GRAY}${body}${COLORS.RESET}` : ""
      }\n`
    );
  },
  debug: ({ header, body }: { header: string; body?: string }) =>
    process.stderr.write(
      `[DEBUG][socket-server] ${header} ${
        body ? `\n${COLORS.GRAY}${body}${COLORS.RESET}` : ""
      }\n`
    ),
  warn: ({ header, body }: { header: string; body?: string }) =>
    process.stderr.write(
      `[WARN][socket-server] ${header} ${
        body ? `\n${COLORS.GRAY}${body}${COLORS.RESET}` : ""
      }\n`
    ),
  error: ({ header, body }: { header: string; body?: string }) =>
    process.stderr.write(
      `[ERROR][socket-server] ${header} ${
        body ? `\n${COLORS.GRAY}${body}${COLORS.RESET}` : ""
      }\n`
    ),
  log: ({ header, body }: { header: string; body?: string }) =>
    process.stderr.write(
      `[LOG][socket-server] ${header} ${
        body ? `\n${COLORS.GRAY}${body}${COLORS.RESET}` : ""
      }\n`
    ),
};

// Type definitions
interface ClientInfo {
  ws: WebSocket;
  channel: string | null;
  clientType: string;
}

enum MessageSource {
  SOCKET_SERVER = "socket_server",
  MCP_SERVER = "mcp_server",
  FIGMA_CLIENT = "figma_client",
  UNKNOWN = "unknown",
}

enum MessageType {
  GET_CHANNELS = "get_channels",
  SELECT_CHANNEL = "select_channel",
  CHECK_CONNECTION_STATUS = "check_connection_status",
  JOIN = "join",
  MESSAGE = "message",
  NOTIFY = "notify",
  TRANSMIT = "transmit",
  JOIN_RESULT = "join_result",
  ERROR = "error",
  CONNECTION = "connection",
}

interface Message {
  source: MessageSource;
  type: MessageType;
  payload?: any;
}

// Store all connected clients with their metadata
const clients = new Map<WebSocket, ClientInfo>();

// Predefined list of available channels
const availableChannels = [
  "1-A",
  "2-B",
  "3-C",
  "4-D",
  "5-E",
  "6-F",
  "7-G",
  "8-H",
  "9-I",
  "10-J",
];

// Message handlers
function handleGetChannels(ws: WebSocket, message: Message): void {
  const clientInfo = clients.get(ws);
  logger.info({
    header: `WebSocket client requested channel list`,
    body: `Client type: ${clientInfo?.clientType || MessageSource.UNKNOWN}`,
  });

  ws.send(
    JSON.stringify({
      source: MessageSource.SOCKET_SERVER,
      type: MessageType.GET_CHANNELS,
      payload: {
        id: message.payload?.id,
        channels: availableChannels,
      },
    })
  );
}

function handleJoinChannel(ws: WebSocket, message: Message): void {
  const clientInfo = clients.get(ws);
  if (!clientInfo) return;

  const { channel, clientType = MessageSource.UNKNOWN } = message.payload || {};

  if (!availableChannels.includes(channel)) {
    ws.send(
      JSON.stringify({
        source: MessageSource.SOCKET_SERVER,
        type: MessageType.JOIN_RESULT,
        payload: {
          success: false,
          error: "Invalid channel",
          channel,
        },
      })
    );
    return;
  }

  const oldChannel = clientInfo.channel;
  clientInfo.channel = channel;
  clientInfo.clientType = clientType;

  logger.info({
    header: `WebSocket client joined channel`,
    body: `Channel: ${channel}, Client type: ${clientType}`,
  });

  // Notify old channel if leaving
  if (oldChannel && oldChannel !== channel) {
    broadcastToChannel(
      oldChannel,
      {
        source: MessageSource.SOCKET_SERVER,
        type: MessageType.NOTIFY,
        payload: {
          channel: oldChannel,
          message: `A ${clientType} has left the channel`,
        },
      },
      ws
    );
  }

  // Notify new channel
  broadcastToChannel(
    channel,
    {
      source: MessageSource.SOCKET_SERVER,
      type: MessageType.NOTIFY,
      payload: {
        channel,
        message: `A ${clientType} has joined the channel`,
      },
    },
    ws
  );

  // Send success response
  ws.send(
    JSON.stringify({
      source: MessageSource.SOCKET_SERVER,
      type: MessageType.JOIN_RESULT,
      payload: {
        success: true,
        channel,
      },
    })
  );
}

function handleMessage(ws: WebSocket, message: Message): void {
  const clientInfo = clients.get(ws);
  const channel = message.payload?.channel || clientInfo?.channel;

  if (!channel) {
    ws.send(
      JSON.stringify({
        source: MessageSource.SOCKET_SERVER,
        type: MessageType.ERROR,
        payload: {
          message: "No channel specified",
        },
      })
    );
    return;
  }

  logger.info({
    header: `Broadcasting message to channel`,
    body: `Channel: ${channel}, Sender: ${clientInfo?.clientType || "unknown"}`,
  });

  // Add channel to the message if not already present
  const messageData = message.payload?.message;
  if (messageData && !messageData.channel) {
    messageData.channel = channel;
  }

  broadcastToChannel(channel, {
    source: MessageSource.SOCKET_SERVER,
    type: MessageType.TRANSMIT,
    payload: {
      channel,
      message: messageData,
      sender: clientInfo?.clientType || MessageSource.UNKNOWN,
    },
  });
}

function handleClientDisconnect(ws: WebSocket): void {
  const clientInfo = clients.get(ws);
  logger.info({
    header: `WebSocket client disconnected`,
    body: `Client type: ${clientInfo?.clientType || MessageSource.UNKNOWN}`,
  });

  const channel = clientInfo?.channel;
  clients.delete(ws);

  // Notify other clients in the same channel
  if (channel && clientInfo) {
    broadcastToChannel(
      channel,
      {
        source: MessageSource.SOCKET_SERVER,
        type: MessageType.NOTIFY,
        payload: {
          channel,
          message: `A ${
            clientInfo.clientType || MessageSource.UNKNOWN
          } has left the channel`,
        },
      },
      ws
    );
  }
}

// Broadcast message to all clients in a specific channel
function broadcastToChannel(
  channel: string,
  message: Message,
  excludeClient?: WebSocket
): void {
  for (const [_, clientInfo] of clients.entries()) {
    if (
      clientInfo.channel === channel &&
      clientInfo.ws !== excludeClient &&
      clientInfo.ws.readyState === WebSocket.OPEN
    ) {
      clientInfo.ws.send(JSON.stringify(message));
    }
  }
}

function handleConnection(ws: WebSocket) {
  // Add client to our map with default values
  clients.set(ws, {
    ws,
    channel: null,
    clientType: MessageSource.UNKNOWN,
  });

  ws.send(
    JSON.stringify({
      source: MessageSource.SOCKET_SERVER,
      type: MessageType.CONNECTION,
      payload: {
        message: "Connected to WebSocket",
      },
    })
  );

  ws.on("close", () => handleClientDisconnect(ws));

  ws.on("message", (messageBuffer: Buffer) => {
    try {
      logger.debug({
        header: `Received message from websocket client`,
        body: messageBuffer.toString(),
      });
      const message: Message = JSON.parse(messageBuffer.toString());

      switch (message.type) {
        case MessageType.GET_CHANNELS:
          handleGetChannels(ws, message);
          break;
        case MessageType.JOIN:
          handleJoinChannel(ws, message);
          break;
        case MessageType.MESSAGE:
          handleMessage(ws, message);
          break;
        default:
          ws.send(
            JSON.stringify({
              source: MessageSource.SOCKET_SERVER,
              type: MessageType.ERROR,
              payload: {
                message: "Unknown message type",
              },
            })
          );
      }
    } catch (err) {
      logger.error({
        header: `Error handling message`,
        body: err.message,
      });
      ws.send(
        JSON.stringify({
          source: MessageSource.SOCKET_SERVER,
          type: MessageType.ERROR,
          payload: {
            message: "Error processing message",
          },
        })
      );
    }
  });
}

// Create HTTP server for CORS handling
const server = createServer((req, res) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  // Return response for non-WebSocket requests
  res.writeHead(200, {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "text/plain",
  });
  res.end("WebSocket server running");
});

// Create WebSocket server
const wss = new WebSocketServer({
  server,
  verifyClient: () => true,
});

wss.on("connection", handleConnection);

const PORT = 3055;
server.listen(PORT, () => {
  logger.info({
    header: `WebSocket server running`,
    body: `Port: ${PORT}, Available channels: ${availableChannels.join(", ")}`,
  });
});
