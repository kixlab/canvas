import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import WebSocket from "ws";
import {
  getWebSocket,
  getCurrentChannel,
  connectToFigma,
} from "../common/websocket.js";
import { createErrorResponse, createSuccessResponse } from "../common/utils.js";

export function registerConnectionTools(server: McpServer) {
  server.tool(
    "get_channels",
    "Get available Figma channels for communication",
    {},
    async () => {
      try {
        const ws = getWebSocket();
        const currentChannel = getCurrentChannel();

        if (!ws || ws.readyState !== WebSocket.OPEN) {
          connectToFigma();
          return createSuccessResponse(
            "Not connected to Figma. Attempting to connect..."
          );
        }

        // Get available channels
        const id = uuidv4();
        return new Promise((resolve) => {
          ws!.send(
            JSON.stringify({
              id,
              type: "get_channels",
            })
          );

          // Set up a one-time listener for the response
          const messageHandler = (data: any) => {
            try {
              const json = JSON.parse(data.toString());

              if (json.type === "channels" && json.channels) {
                const availableChannels = json.channels;
                ws!.removeListener("message", messageHandler);

                resolve({
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify({
                        availableChannels,
                        currentChannel,
                      }),
                    },
                  ],
                });
              }
            } catch (error) {
              // Keep listening, this message wasn't the channels response
            }
          };

          ws!.on("message", messageHandler);

          // Set a timeout for the channels response
          setTimeout(() => {
            ws!.removeListener("message", messageHandler);
            resolve(
              createSuccessResponse("Timed out waiting for available channels")
            );
          }, 5000);
        });
      } catch (error) {
        return createErrorResponse(error, "getting channels");
      }
    }
  );

  // Join Channel Tool
  server.tool(
    "select_channel",
    "Select a specific Figma channel for communication",
    {
      channel: z.string().describe("The channel name to join"),
    },
    async ({ channel }) => {
      try {
        const ws = getWebSocket();

        if (!ws || ws.readyState !== WebSocket.OPEN) {
          connectToFigma();
          return createSuccessResponse(
            "Not connected to Figma. Attempting to connect..."
          );
        }

        // Join the requested channel
        return new Promise((resolve) => {
          ws!.send(
            JSON.stringify({
              type: "join",
              channel: channel,
              clientType: "mcp_client",
            })
          );

          // Set up a one-time listener for join response
          const joinHandler = (joinData: any) => {
            try {
              const joinJson = JSON.parse(joinData.toString());

              if (
                joinJson.type === "join_result" &&
                joinJson.channel === channel
              ) {
                ws!.removeListener("message", joinHandler);

                if (joinJson.success) {
                  resolve(
                    createSuccessResponse(
                      `Successfully joined channel: ${channel}`
                    )
                  );
                } else {
                  resolve(
                    createSuccessResponse(
                      `Failed to join channel: ${
                        joinJson.error || "Unknown error"
                      }`
                    )
                  );
                }
              }
            } catch (error) {
              // Keep listening, this message wasn't the join response
            }
          };

          ws!.on("message", joinHandler);

          // Set a timeout for the join response
          setTimeout(() => {
            ws!.removeListener("message", joinHandler);
            resolve(
              createSuccessResponse(
                "Timed out waiting for channel join response"
              )
            );
          }, 5000);
        });
      } catch (error) {
        return createErrorResponse(error, "selecting channel");
      }
    }
  );

  server.tool(
    "check_connection_status",
    "Check the connection status with Figma",
    {},
    async () => {
      try {
        const ws = getWebSocket();
        const currentChannel = getCurrentChannel();

        if (!ws || ws.readyState !== WebSocket.OPEN) {
          connectToFigma();
          return createSuccessResponse(
            "Not connected to Figma. Attempting to connect..."
          );
        }

        // If we're connected but don't have a channel
        if (!currentChannel) {
          return createSuccessResponse(
            "Connected to Figma socket server but not joined to any channel. Waiting for channel connection..."
          );
        }

        return createSuccessResponse(
          `Connected to Figma socket server and joined channel: ${currentChannel}`
        );
      } catch (error) {
        return createErrorResponse(error, "connecting to Figma");
      }
    }
  );
}
