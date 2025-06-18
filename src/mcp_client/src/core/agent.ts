import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { loadServerConfig } from "../utils/helpers";
import { getModel, ModelInstance } from "../models/factory";
import {
  AgentMetadata,
  ModelProvider,
  CallToolRequestParams,
  ToolResponseFormat,
  UserRequestMessage,
  GenericMessage,
  AgentRequestMessage,
  RoleType,
  ContentType,
  MessageType,
  ToolResponseMessage,
} from "../types";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "crypto";

interface AgentState {
  model: ModelInstance | null;
  client: Client | null;
  transport: StdioClientTransport | null;
  tools: Map<string, any>;
  initialized: boolean;
}

let agentState: AgentState = {
  model: null,
  client: null,
  transport: null,
  tools: new Map(),
  initialized: false,
};

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

    const toolsExists =
      toolsResult.tools &&
      toolsResult.tools.length > 0 &&
      toolsResult.tools.every((tool) => tool.name && tool.inputSchema);

    if (!toolsExists) {
      throw new Error("No valid tools found in MCP server");
    }

    // Register tools by model type if available
    agentState.tools.clear();

    if (
      agentState.model.provider === ModelProvider.GOOGLE ||
      agentState.model.provider === ModelProvider.OLLAMA
    ) {
      // Google Bard does not support tools yet
      throw new Error("Google and Ollama model are not supported yet.");
    }

    const toolList = agentState.model.formatToolList(toolsResult.tools);
    for (const tool of toolList) {
      agentState.tools.set(tool.name, tool);
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

export async function callTool(
  toolCall: CallToolRequestParams
): Promise<CallToolResult> {
  if (!agentState.initialized || !agentState.client) {
    return {
      id: toolCall.id,
      call_id: toolCall.call_id,
      content: [
        {
          type: ToolResponseFormat.TEXT,
          text: "Agent not initialized. Call startup() first.",
        },
      ],
      isError: true,
    };
  }

  try {
    if (!agentState.tools.has(toolCall.name)) {
      return {
        id: toolCall.id,
        call_id: toolCall.call_id,
        content: [
          {
            type: ToolResponseFormat.TEXT,
            text: `Tool '${toolCall.name}' not found`,
          },
        ],
        isError: true,
      };
    }

    const result = (await agentState.client.callTool({
      name: toolCall.name,
      arguments: toolCall.arguments,
    })) as CallToolResult;

    const formattedResult = {
      id: toolCall.id,
      call_id: toolCall.call_id,
      content: result.content,
      isError: result.isError || false,
    } as CallToolResult;

    if (result.structuredContent) {
      formattedResult.structuredContent = result.structuredContent;
    }

    return formattedResult;
  } catch (error) {
    return {
      id: toolCall.id,
      call_id: toolCall.call_id,
      content: [
        {
          type: ToolResponseFormat.TEXT,
          text: String(error),
        },
      ],
      isError: true,
    };
  }
}

export function createToolCall(
  toolName: string,
  id: string,
  args?: Record<string, unknown>,
  callId?: string
): CallToolRequestParams {
  if (!agentState.initialized || !agentState.model) {
    throw new Error("Agent not initialized. Call startAgent() first.");
  }
  if (!agentState.tools.has(toolName)) {
    throw new Error(`Tool '${toolName}' not found`);
  }
  return {
    id: id,
    call_id: callId ?? "",
    name: toolName,
    arguments: args ?? {},
  };
}

export async function runReactAgent(
  userMessage: UserRequestMessage,
  metadata: AgentMetadata = { input_id: "unknown" },
  maxTurns = 20
): Promise<{ history: GenericMessage[]; responses: any[]; cost: number }> {
  if (!agentState.initialized || !agentState.model) {
    throw new Error("Agent not initialized. Call startAgent() first.");
  }

  const initialRequest = agentState.model.formatRequest([userMessage]); // [TODO] Add system prompt
  const toolsArray = Array.from(agentState.tools.values());
  const apiMessageContext = agentState.model.createMessageContext();
  const formattedMessageContext = new Array<GenericMessage>();
  const rawResponses = new Array();

  apiMessageContext.push(...initialRequest);
  formattedMessageContext.push(userMessage);

  let turn = 0;
  let cost = 0;

  // ReAct Loop
  while (turn < maxTurns) {
    // Reason
    const modelResponse = await agentState.model.generateResponseWithTool(
      apiMessageContext,
      toolsArray
    );
    rawResponses.push(modelResponse);

    cost += agentState.model.getCostFromResponse(modelResponse);
    agentState.model.addToApiMessageContext(modelResponse, apiMessageContext);
    agentState.model.addToFormattedMessageContext(
      modelResponse,
      formattedMessageContext
    );

    // Exit loop if no tool calls are detected
    const callToolRequests =
      agentState.model.formatCallToolRequest(modelResponse);
    if (!callToolRequests || callToolRequests.length === 0) {
      console.log("No tool calls detected. Exiting ReAct loop.");
      break;
    }

    // Act
    const toolResults = [];
    for (const toolRequest of callToolRequests) {
      const toolResult = await callTool(toolRequest);
      const toolResponse = agentState.model.formatToolResponse(toolResult);
      apiMessageContext.push(toolResponse);
      toolResults.push(toolResult);
    }

    formattedMessageContext.push({
      id: randomUUID(),
      timestamp: Date.now(),
      role: RoleType.TOOL,
      type: MessageType.TOOL_RESPONSE,
      content: toolResults.map((result) => ({
        type: ContentType.TEXT,
        text: result.content.map((c) => c.text).join("\n"),
      })),
      results: toolResults,
    } as ToolResponseMessage);
    turn += 1;
  }
  return {
    history: formattedMessageContext,
    responses: rawResponses,
    cost: cost / 1000, // Convert to USD
  };
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
