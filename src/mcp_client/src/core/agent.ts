import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { loadServerConfig } from "../utils/helpers";
import { getModel, ModelInstance } from "../models/factory";
import {
  AgentInput,
  AgentResponse,
  AgentMetadata,
  ToolCallResult,
} from "../types";
import { string } from "yaml/dist/schema/common/string";

interface AgentState {
  model: ModelInstance | null;
  client: Client | null;
  transport: StdioClientTransport | null;
  tools: Map<string, any>;
  initialized: boolean;
}

// Global agent state
let agentState: AgentState = {
  model: null,
  client: null,
  transport: null,
  tools: new Map(),
  initialized: false,
};

// Global variables for tracking state
let currentChannel: string | null = null;
let rootFrameId: string | null = null;
let rootFrameWidth: number = 0;
let rootFrameHeight: number = 0;

export async function startAgent(agentType: string = "single"): Promise<void> {
  if (agentState.initialized) {
    console.log("Agent already initialized");
    return;
  }

  try {
    const config = loadServerConfig(agentType);

    if (!config.models || config.models.length === 0) {
      throw new Error("No models defined in config");
    }

    agentState.model = getModel(config.models[0]);
    const serverPath = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "mcp_server",
      "dist",
      "server.js"
    );

    agentState.transport = new StdioClientTransport({
      command: "node",
      args: [serverPath],
    });

    agentState.client = new Client(
      {
        name: "mcp-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    await agentState.client.connect(agentState.transport);
    const toolsResult = await agentState.client.listTools();

    agentState.tools.clear();
    if (toolsResult.tools) {
      for (const tool of toolsResult.tools) {
        agentState.tools.set(tool.name, tool);
      }
    }

    agentState.initialized = true;
    console.log(`Agent initialized with ${agentState.tools.size} tools`);
  } catch (error) {
    console.error("Failed to initialize agent:", error);
    throw error;
  }
}

export async function shutdownAgent(): Promise<void> {
  if (!agentState.initialized) {
    return;
  }

  try {
    if (agentState.client) {
      await agentState.client.close();
    }

    agentState.model = null;
    agentState.client = null;
    agentState.transport = null;
    agentState.tools.clear();
    agentState.initialized = false;

    console.log("Agent shutdown complete");
  } catch (error) {
    console.error("Error during shutdown:", error);
  }
}

export async function runSingleAgent(
  userInput: AgentInput[],
  metadata: AgentMetadata = { input_id: "unknown" }
): Promise<AgentResponse> {
  if (!agentState.initialized || !agentState.model) {
    throw new Error("Agent not initialized. Call startup() first.");
  }

  try {
    const messages = userInput.map((input) => {
      if (input.type === "text") {
        return {
          role: "user",
          content: input.text || "",
        };
      } else if (input.type === "image_url" && input.image_url) {
        return {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: input.image_url,
            },
          ],
        };
      }
      return { role: "user", content: "" };
    });

    const response = await agentState.model.generateResponse(messages, {
      tools: Array.from(agentState.tools.values()),
      metadata: metadata,
    });

    const agentResponse: AgentResponse = {
      response: JSON.stringify(response),
      json_response: response,
      step_count: 1,
      messages: messages,
    };

    return agentResponse;
  } catch (error) {
    console.error("Error in runSingleAgent:", error);
    throw error;
  }
}

export async function callTool(
  toolName: string,
  args: any = {}
): Promise<ToolCallResult> {
  if (!agentState.initialized || !agentState.client) {
    return {
      status: "error",
      content: [
        {
          type: "text",
          text: "Agent not initialized. Call startup() first.",
        },
      ],
    };
  }

  try {
    if (!agentState.tools.has(toolName)) {
      return {
        status: "error",
        content: [
          {
            type: "text",
            text: `Tool '${toolName}' not found`,
          },
        ],
      };
    }

    const result = (await agentState.client.callTool({
      name: toolName,
      arguments: args,
    })) as {
      content: [
        {
          type: string;
          [key: string]: string;
        }
      ];
    };

    return {
      status: "success",
      content: result.content,
    };
  } catch (error) {
    return {
      status: "error",
      content: [
        {
          type: "text",
          text: String(error),
        },
      ],
    };
  }
}

///////////////////////////////////////////////////////
////////// Getter functions for global state //////////
///////////////////////////////////////////////////////

export function getCurrentChannel(): string | null {
  return currentChannel;
}

export function setCurrentChannel(channel: string | null): void {
  currentChannel = channel;
}

export function getRootFrameInfo(): {
  id: string | null;
  width: number;
  height: number;
} {
  return {
    id: rootFrameId,
    width: rootFrameWidth,
    height: rootFrameHeight,
  };
}

export function setRootFrameInfo(
  id: string | null,
  width: number,
  height: number
): void {
  rootFrameId = id;
  rootFrameWidth = width;
  rootFrameHeight = height;
}
