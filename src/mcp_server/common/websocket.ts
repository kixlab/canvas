import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";
import {
  FigmaCommand,
  PendingRequest,
  ProgressMessage,
  CommandProgressUpdate,
} from "../types.js";
import { logger, serverUrl, WS_URL, SERVER_CONFIG } from "../config.js";

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
    logger.info("Already connected to Figma");
    return;
  }

  const wsUrl = serverUrl === "localhost" ? `${WS_URL}:${port}` : WS_URL;
  logger.info(`Connecting to Figma socket server at ${wsUrl}...`);
  ws = new WebSocket(wsUrl);

  ws.on("open", () => {
    logger.info("Connected to Figma socket server");

    // Send initial message to identify the client
    // We don't send a channel join yet since we need to fetch available channels first
    const id = uuidv4();
    ws!.send(
      JSON.stringify({
        id,
        type: "get_channels",
      })
    );
  });

  ws.on("message", (data: any) => {
    handleWebSocketMessage(data);
  });

  ws.on("error", (error: Error) => {
    logger.error(`Socket error: ${error}`);
  });

  ws.on("close", () => {
    logger.info("Disconnected from Figma socket server");
    ws = null;
    currentChannel = null; // Reset current channel on disconnection

    // Reject all pending requests
    for (const [id, request] of pendingRequests.entries()) {
      clearTimeout(request.timeout);
      request.reject(new Error("Connection closed"));
      pendingRequests.delete(id);
    }

    // Attempt to reconnect
    logger.info(
      `Attempting to reconnect in ${
        SERVER_CONFIG.reconnectDelay / 1000
      } seconds...`
    );
    setTimeout(() => connectToFigma(port), SERVER_CONFIG.reconnectDelay);
  });
}

function handleWebSocketMessage(data: any) {
  try {
    const json = JSON.parse(data) as ProgressMessage;

    // Handle channels response
    if (json.type === "channels" && json.channels) {
      logger.info(`Available channels: ${json.channels.join(", ")}`);

      // Auto-join the first channel if we're not already in a channel
      if (!currentChannel && json.channels.length > 0) {
        const channelToJoin = json.channels[0];
        logger.info(`Auto-joining channel: ${channelToJoin}`);

        ws!.send(
          JSON.stringify({
            type: "join",
            channel: channelToJoin,
            clientType: "mcp_client", // Set client type to mcp_client
          })
        );
      }
      return;
    }

    // Handle join channel result
    if (json.type === "join_result") {
      if (json.success) {
        currentChannel = json.channel || null;
        logger.info(`Successfully joined channel: ${currentChannel}`);
      } else {
        logger.error(
          `Failed to join channel: ${json.error || "Unknown error"}`
        );
      }
      return;
    }

    // Handle progress updates
    if (json.type === "progress_update") {
      handleProgressUpdate(json);
      return;
    }

    // Handle regular responses
    const myResponse = json.message || json;

    // Handle response to a request
    if (
      myResponse.id &&
      pendingRequests.has(myResponse.id) &&
      (myResponse.result !== undefined || myResponse.error !== undefined)
    ) {
      const request = pendingRequests.get(myResponse.id)!;
      clearTimeout(request.timeout);

      if (myResponse.error) {
        logger.error(`Error from Figma: ${myResponse.error}`);
        request.reject(new Error(myResponse.error));
      } else {
        const result = myResponse.result || {};
        request.resolve(result);
      }

      pendingRequests.delete(myResponse.id);
    } else {
      // Handle broadcast messages or events
      logger.info(`Received broadcast message: ${JSON.stringify(myResponse)}`);
    }
  } catch (error) {
    logger.error(
      `Error parsing message: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function handleProgressUpdate(json: ProgressMessage) {
  const progressData = json.message?.data as CommandProgressUpdate;
  const requestId = json.id || "";

  if (requestId && pendingRequests.has(requestId)) {
    const request = pendingRequests.get(requestId)!;

    // Update last activity timestamp
    request.lastActivity = Date.now();

    // Reset the timeout to prevent timeouts during long-running operations
    clearTimeout(request.timeout);

    // Create a new timeout
    request.timeout = setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        logger.error(
          `Request ${requestId} timed out after extended period of inactivity`
        );
        pendingRequests.delete(requestId);
        request.reject(new Error("Request to Figma timed out"));
      }
    }, SERVER_CONFIG.extendedTimeout);

    // Log progress
    logger.info(
      `Progress update for ${progressData.commandType}: ${progressData.progress}% - ${progressData.message}`
    );

    // For completed updates, we could resolve the request early if desired
    if (progressData.status === "completed" && progressData.progress === 100) {
      // Instead, just log the completion, wait for final result from Figma
      logger.info(
        `Operation ${progressData.commandType} completed, waiting for final result`
      );
    }
  }
}

// Simplified sendCommandToFigma function without channel requirements
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
    const request = {
      id,
      type: "message",
      channel: currentChannel, // Include the current channel
      message: {
        id,
        command,
        params: {
          ...(params as any),
          commandId: id, // Include the command ID in params
        },
      },
    };

    // Set timeout for request
    const timeout = setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        logger.error(
          `Request ${id} to Figma timed out after ${timeoutMs / 1000} seconds`
        );
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
    logger.info(
      `Sending command to Figma: ${command} in channel: ${currentChannel}`
    );
    logger.debug(`Request details: ${JSON.stringify(request)}`);
    ws.send(JSON.stringify(request));
  });
}
