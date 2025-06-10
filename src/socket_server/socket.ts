import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";

interface ClientInfo {
  ws: WebSocket;
  channel: string | null;
  clientType: string;
}

// Store all connected clients with their metadata
const clients = new Map<WebSocket, ClientInfo>();

// Predefined list of available channels
const availableChannels = [
  "1_🐶_fluffy_puppy",
  "2_🐱_playful_kitten",
  "3_🐰_tiny_bunny",
  "4_🦔cuddly_hedgehog",
  "5_🐼_sleepy_panda",
  "6_🐨_gentle_koala",
  "7_🦁_curious_lion",
  "8_🐧_lazy_penguin",
  "9_🐬_soft_dolphin",
  "10_🦦_happy_otter",
];

function handleConnection(ws: WebSocket) {
  console.log("New client connected");

  // Add client to our map with default values
  clients.set(ws, {
    ws,
    channel: null,
    clientType: "unknown",
  });

  ws.send(
    JSON.stringify({
      type: "system",
      message: "Connected to chat server",
    })
  );

  ws.on("close", () => {
    console.log(
      `Client disconnected (type: ${clients.get(ws)?.clientType || "unknown"})`
    );

    // Get the client's channel before removing
    const clientInfo = clients.get(ws);
    const channel = clientInfo?.channel;

    // Remove client from the map
    clients.delete(ws);

    // Notify other clients in the same channel
    if (channel) {
      broadcastToChannel(
        channel,
        {
          type: "system",
          channel: channel,
          message: `A ${clientInfo?.clientType || "user"} has left the channel`,
        },
        ws
      );
    }
  });

  ws.on("message", (message: Buffer) => {
    try {
      console.log("Received message from client:", message.toString());
      const data = JSON.parse(message.toString());
      const clientInfo = clients.get(ws);

      // Handle get_channels request
      if (data.type === "get_channels") {
        console.log(
          `Client requested channel list (type: ${
            clientInfo?.clientType || "unknown"
          })`
        );
        ws.send(
          JSON.stringify({
            type: "channels",
            id: data.id,
            channels: availableChannels,
          })
        );
        return;
      }

      // Handle join channel request
      if (data.type === "join") {
        const channel = data.channel;
        const clientType = data.clientType || "unknown";

        if (!availableChannels.includes(channel)) {
          ws.send(
            JSON.stringify({
              type: "join_result",
              success: false,
              error: "Invalid channel",
              channel: channel,
            })
          );
          return;
        }

        // Update client info
        if (clientInfo) {
          const oldChannel = clientInfo.channel;
          clientInfo.channel = channel;
          clientInfo.clientType = clientType;

          console.log(
            `Client joined channel: ${channel} (type: ${clientType})`
          );

          // If leaving a previous channel, notify others in that channel
          if (oldChannel && oldChannel !== channel) {
            broadcastToChannel(
              oldChannel,
              {
                type: "system",
                channel: oldChannel,
                message: `A ${clientType} has left the channel`,
              },
              ws
            );
          }

          // Notify others in the new channel
          broadcastToChannel(
            channel,
            {
              type: "system",
              channel: channel,
              message: `A ${clientType} has joined the channel`,
            },
            ws
          );

          // Send success response
          ws.send(
            JSON.stringify({
              type: "join_result",
              success: true,
              channel: channel,
            })
          );
        }
        return;
      }

      // Handle regular messages - must have channel info
      if (data.type === "message") {
        const channel = data.channel || clientInfo?.channel;

        if (!channel) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "No channel specified",
            })
          );
          return;
        }

        console.log(
          `Broadcasting message to channel: ${channel} (from: ${
            clientInfo?.clientType || "unknown"
          })`
        );

        // Add channel to the message if not already present
        const message = data.message;
        if (message && !message.channel) {
          message.channel = channel;
        }

        // Broadcast only to clients in the same channel
        broadcastToChannel(channel, {
          type: "broadcast",
          channel: channel,
          message: message,
          sender: clientInfo?.clientType || "unknown",
        });
      }
    } catch (err) {
      console.error("Error handling message:", err);
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Error processing message",
        })
      );
    }
  });
}

// Broadcast message to all clients in a specific channel
function broadcastToChannel(
  channel: string,
  message: any,
  excludeClient?: WebSocket
) {
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
  verifyClient: () => {
    // Add CORS headers for WebSocket upgrade
    return true;
  },
});

wss.on("connection", handleConnection);

const PORT = 3055;
server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
  console.log(`Available channels: ${availableChannels.join(", ")}`);
});
