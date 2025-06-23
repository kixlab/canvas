import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";
import {
  FigmaCommand,
  PendingRequest,
  ProgressMessage,
  CommandProgressUpdate,
} from "../types.js";
import { logger, serverUrl, WS_URL, SERVER_CONFIG } from "../config.js";

// Type definitions to match socket server
enum MessageSource {
  SOCKET_SERVER = "socket_server",
  MCP_SERVER = "mcp_server",
  FIGMA_CLIENT = "figma_client",
  UNKNOWN = "unknown",
}

enum MessageType {
  GET_CHANNELS = "get_channels",
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

// WebSocket connection and request tracking
let ws: WebSocket | null = null;
let currentChannel: string | null = null;
const pendingRequests = new Map<string, PendingRequest>();

export function getWebSocket(): WebSocket | null {
  return ws;
}

export function getCurrentChannel(): string | null {
  return currentChannel;
}

export function connectToFigma(
  port: number = SERVER_CONFIG.defaultWebSocketPort
) {
  // If already connected, do nothing
  if (ws && ws.readyState === WebSocket.OPEN) {
    logger.info({ header: "Already connected to Figma" });
    return;
  }

  const wsUrl = serverUrl === "localhost" ? `${WS_URL}:${port}` : WS_URL;
  logger.info({ header: `Connecting to Figma socket server at ${wsUrl}...` });
  ws = new WebSocket(wsUrl);

  ws.on("open", () => {
    logger.info({ header: "Connected to Figma socket server" });

    // Send initial message to get available channels
    const id = uuidv4();
    const message: Message = {
      source: MessageSource.MCP_SERVER,
      type: MessageType.GET_CHANNELS,
      payload: {
        id,
      },
    };

    ws!.send(JSON.stringify(message));
  });

  ws.on("message", (data: any) => {
    handleWebSocketMessage(data);
  });

  ws.on("error", (error: Error) => {
    logger.error({ header: `Socket error: ${error}` });
  });

  ws.on("close", () => {
    logger.info({ header: "Disconnected from Figma socket server" });
    ws = null;
    currentChannel = null; // Reset current channel on disconnection

    // Reject all pending requests
    for (const [id, request] of pendingRequests.entries()) {
      clearTimeout(request.timeout);
      request.reject(new Error("Connection closed"));
      pendingRequests.delete(id);
    }

    // Attempt to reconnect
    logger.info({
      header: `Attempting to reconnect in ${
        SERVER_CONFIG.reconnectDelay / 1000
      } seconds...`,
    });
    setTimeout(() => connectToFigma(port), SERVER_CONFIG.reconnectDelay);
  });
}

function handleWebSocketMessage(data: any) {
  try {
    const message = JSON.parse(data) as Message;
    logger.debug({
      header: `Received message`,
      body: `${JSON.stringify(message)}`,
    });

    switch (message.type) {
      case MessageType.CONNECTION:
        logger.info({ header: "Connection confirmed by socket server" });
        break;

      case MessageType.GET_CHANNELS:
        handleChannelList(message.payload?.channels);
        break;

      case MessageType.JOIN_RESULT:
        handleJoinResult(message.payload);
        break;

      case MessageType.ERROR:
        logger.error({
          header: `Socket server error`,
          body: `${message.payload?.message}`,
        });
        break;

      case MessageType.NOTIFY:
        if (
          currentChannel &&
          message.payload?.channel &&
          message.payload.channel !== currentChannel
        ) {
          return;
        }
        logger.info({ header: `Notification: ${message.payload?.message}` });
        break;

      case MessageType.TRANSMIT:
        if (
          currentChannel &&
          message.payload?.channel &&
          message.payload.channel !== currentChannel
        ) {
          return;
        }
        handleTransmittedMessage(message.payload);
        break;

      default:
        logger.warn({ header: `Unknown message type: ${message.type}` });
    }
  } catch (error) {
    logger.error({
      header: `Error parsing message`,
      body: `${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

function handleChannelList(channels: string[]): void {
  if (!Array.isArray(channels) || channels.length === 0) {
    logger.warn({ header: "No channels available from server" });
    return;
  }

  logger.info({
    header: `Available channels`,
    body: `${channels.join(", ")}`,
  });

  // Auto-join the first channel if we're not already in a channel
  if (!currentChannel && channels.length > 0) {
    const channelToJoin = channels[0];
    logger.info({ header: `Auto-joining channel: ${channelToJoin}` });

    const joinMessage: Message = {
      source: MessageSource.MCP_SERVER,
      type: MessageType.JOIN,
      payload: {
        channel: channelToJoin,
        clientType: MessageSource.MCP_SERVER,
      },
    };

    ws!.send(JSON.stringify(joinMessage));
  }
}

function handleJoinResult(payload: any): void {
  if (payload?.success) {
    currentChannel = payload.channel || null;
    logger.info({ header: `Successfully joined channel: ${currentChannel}` });
  } else {
    logger.error({
      header: `Failed to join channel: ${payload?.error || "Unknown error"}`,
    });
  }
}

function handleTransmittedMessage(payload: any): void {
  const messageData = payload.message;

  if (!messageData) {
    logger.warn({ header: "Received transmit message without message data" });
    return;
  }

  // Handle progress updates
  if (messageData.type === "progress_update") {
    handleProgressUpdate(messageData);
    return;
  }

  // Handle response to a request
  if (
    messageData.id &&
    pendingRequests.has(messageData.id) &&
    (messageData.result !== undefined || messageData.error !== undefined)
  ) {
    const request = pendingRequests.get(messageData.id)!;
    clearTimeout(request.timeout);

    if (messageData.error) {
      logger.error({ header: `Error from Figma: ${messageData.error}` });
      request.reject(new Error(messageData.error));
    } else {
      const result = messageData.result || {};
      request.resolve(result);
    }

    pendingRequests.delete(messageData.id);
  } else {
    // Handle broadcast messages or events
    logger.info({
      header: `Received broadcast message`,
      body: `${JSON.stringify(messageData)}`,
    });
  }
}

function handleProgressUpdate(messageData: any) {
  const progressData = messageData.data as CommandProgressUpdate;
  const requestId = messageData.id || "";

  if (requestId && pendingRequests.has(requestId)) {
    const request = pendingRequests.get(requestId)!;

    // Update last activity timestamp
    request.lastActivity = Date.now();

    // Reset the timeout to prevent timeouts during long-running operations
    clearTimeout(request.timeout);

    // Create a new timeout
    request.timeout = setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        logger.error({
          header: `Request ${requestId} timed out after extended period of inactivity`,
        });
        pendingRequests.delete(requestId);
        request.reject(new Error("Request to Figma timed out"));
      }
    }, SERVER_CONFIG.extendedTimeout);

    // Log progress
    logger.info({
      header: `Progress update for ${progressData.commandType}`,
      body: `${progressData.progress}% - ${progressData.message}`,
    });

    // For completed updates, we could resolve the request early if desired
    if (progressData.status === "completed" && progressData.progress === 100) {
      // Instead, just log the completion, wait for final result from Figma
      logger.info({
        header: `Operation ${progressData.commandType} completed, waiting for final result`,
      });
    }
  }
}

// Updated sendCommandToFigma function to use new message structure
export function sendCommandToFigma(
  command: FigmaCommand,
  params: unknown = {},
  timeoutMs: number = SERVER_CONFIG.requestTimeout
): Promise<any> {
  return new Promise((resolve, reject) => {
    // If not connected, try to connect first
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connectToFigma();
      reject(new Error("Not connected to Figma. Attempting to connect..."));
      return;
    }

    // Check if we have a channel
    if (!currentChannel) {
      reject(
        new Error(
          "Not connected to any channel. Please wait for channel connection."
        )
      );
      return;
    }

    const id = uuidv4();
    const message: Message = {
      source: MessageSource.MCP_SERVER,
      type: MessageType.MESSAGE,
      payload: {
        channel: currentChannel,
        message: {
          id,
          command,
          params: {
            ...(params as any),
            commandId: id, // Include the command ID in params
          },
        },
      },
    };

    // Set timeout for request
    const timeout = setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        logger.error({
          header: `Request ${id} to Figma timed out after ${
            timeoutMs / 1000
          } seconds`,
        });
        reject(new Error("Request to Figma timed out"));
      }
    }, timeoutMs);

    // Store the promise callbacks to resolve/reject later
    pendingRequests.set(id, {
      resolve,
      reject,
      timeout,
      lastActivity: Date.now(),
    });

    // Send the request
    logger.info({
      header: `Sending command to Figma: ${command} in channel (${currentChannel})`,
    });
    logger.debug({
      header: ``,
      body: `${JSON.stringify(message)}`,
    });
    ws.send(JSON.stringify(message));
  });
}
