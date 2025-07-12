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

const CONNECTION_TIMEOUT = 5000;

export function registerConnectionTools(server: McpServer) {
  server.tool(
    "get_channels",
    "[DEBUG] Get available Figma channels for communication",
    {},
    async () => {
      try {
        const ws = getWebSocket();
        const currentChannel = getCurrentChannel();

        if (!ws || ws.readyState !== WebSocket.OPEN) {
          connectToFigma();
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
              if (json.type === "get_channels" && json.payload.channels) {
                const availableChannels = json.payload.channels;
                ws!.removeListener("message", messageHandler);

                resolve(
                  createSuccessResponse({
                    messages: [
                      `Available channels: ${availableChannels.join(", ")}`,
                    ],
                    dataItem: {
                      availableChannels,
                      currentChannel,
                    },
                  })
                );
              }
            } catch (error) {
              // If parsing fails, it might not be the channels response
              console.error("Error parsing channels response:", error);

              createErrorResponse({
                error,
                context: "get_channels",
              });
            }
          };

          ws!.on("message", messageHandler);

          // Set a timeout for the channels response
          setTimeout(() => {
            ws!.removeListener("message", messageHandler);
            resolve(
              createErrorResponse({
                error: new Error("Timed out waiting for available channels"),
                context: "get_channels",
              })
            );
          }, CONNECTION_TIMEOUT);
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "get_channels",
        });
      }
    }
  );

  // Join Channel Tool
  server.tool(
    "select_channel",
    "[DEBUG] Select a specific Figma channel for communication",
    {
      channel: z.string().describe("The channel name to join"),
    },
    async ({ channel }) => {
      try {
        const ws = getWebSocket();

        if (!ws || ws.readyState !== WebSocket.OPEN) {
          connectToFigma();
        }

        // Join the requested channel
        return new Promise((resolve) => {
          ws!.send(
            JSON.stringify({
              source: "mcp_server",
              type: "join",
              payload: {
                channel: channel,
                clientType: "mcp_server",
              },
            })
          );

          // Set up a one-time listener for join response
          const joinHandler = (joinData: any) => {
            try {
              const joinJson = JSON.parse(joinData.toString());

              if (
                joinJson.type === "join_result" &&
                joinJson.payload.channel === channel
              ) {
                ws!.removeListener("message", joinHandler);

                if (joinJson.payload.success) {
                  resolve(
                    createSuccessResponse({
                      messages: [`Successfully joined channel: ${channel}`],
                      dataItem: { channel },
                    })
                  );
                } else {
                  resolve(
                    createErrorResponse({
                      error: new Error(
                        `Failed to join channel: ${
                          joinJson.error || "Unknown error"
                        }`
                      ),
                      context: "select_channel",
                    })
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
              createErrorResponse({
                error: new Error("Timed out waiting for channel join response"),
                context: "select_channel",
              })
            );
          }, 5000);
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "select_channel",
        });
      }
    }
  );

  server.tool(
    "check_connection_status",
    "[DEBUG] Check the connection status with the Figma",
    {},
    async () => {
      try {
        const ws = getWebSocket();
        const currentChannel = getCurrentChannel();

        if (!ws || ws.readyState !== WebSocket.OPEN) {
          connectToFigma();
        }

        // If we're connected but don't have a channel
        if (!currentChannel) {
          throw new Error(
            "Connected to Figma socket server but not joined to any channel."
          );
        }
        return createSuccessResponse({
          messages: [`Connected to Figma on channel: ${currentChannel}`],
          dataItem: {
            currentChannel,
          },
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "check_connection_status",
        });
      }
    }
  );
}
