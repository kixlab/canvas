import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { loadServerConfig } from "../utils/helpers";
import { getModel, ModelInstance } from "../models/factory";
import {
  AgentResponse,
  AgentMetadata,
  ToolCallResult,
  ModelProvider,
  ChatMessage,
  ToolCall,
} from "../types";
import * as OpenAIResponseType from "openai/resources/responses/responses";

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

    if (agentState.model.provider === ModelProvider.OPENAI) {
      const openAITools: OpenAIResponseType.Tool[] =
        agentState.model.formatToolList(toolsResult.tools);
      for (const tool of openAITools) {
        const toolName = tool.type === "function" ? tool.name : "unknown";
        agentState.tools.set(toolName, tool);
      }
    } else if (agentState.model.provider === ModelProvider.ANTHROPIC) {
      throw new Error("Anthropic model provider is not fully implemented yet");
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

export async function callTool(toolCall: ToolCall): Promise<ToolCallResult> {
  if (!agentState.initialized || !agentState.client) {
    return {
      status: "error",
      id: toolCall.id,
      call_id: toolCall.call_id,
      content: [
        {
          type: "text",
          text: "Agent not initialized. Call startup() first.",
        },
      ],
    };
  }

  try {
    if (!agentState.tools.has(toolCall.name)) {
      return {
        status: "error",
        id: toolCall.id,
        call_id: toolCall.call_id,
        content: [
          {
            type: "text",
            text: `Tool '${toolCall.name}' not found`,
          },
        ],
      };
    }

    const result = (await agentState.client.callTool({
      name: toolCall.name,
      arguments: toolCall.arguments,
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
      id: toolCall.id,
      call_id: toolCall.call_id,
      content: result.content,
    };
  } catch (error) {
    return {
      status: "error",
      id: toolCall.id,
      call_id: toolCall.call_id,
      content: [
        {
          type: "text",
          text: String(error),
        },
      ],
    };
  }
}

export function createToolCall(
  toolName: string,
  id: string,
  args?: Record<string, unknown>,
  callId?: string
): ToolCall {
  if (!agentState.initialized || !agentState.model) {
    throw new Error("Agent not initialized. Call startAgent() first.");
  }
  if (!agentState.tools.has(toolName)) {
    throw new Error(`Tool '${toolName}' not found`);
  }
  return {
    id: id,
    call_id: callId,
    name: toolName,
    arguments: args,
  };
}

export async function runReactAgent(
  userMessage: ChatMessage,
  metadata: AgentMetadata = { input_id: "unknown" },
  maxTurns = 20
): Promise<AgentResponse> {
  if (!agentState.initialized || !agentState.model) {
    throw new Error("Agent not initialized. Call startAgent() first.");
  }

  const userRequest = agentState.model.formatRequest(userMessage);
  const toolsArray = Array.from(agentState.tools.values());
  const messageArray = agentState.model.createLocalMessageArray();
  messageArray.push(userRequest);

  let turn = 0;
  let lastAssistantContent: string | null = null;

  // ReAct Loop
  while (turn < maxTurns) {
    // Reason
    const modelResponse = await agentState.model.generateToolResponse(
      messageArray,
      toolsArray
    );

    const assistantOutput = modelResponse.output;
    lastAssistantContent = modelResponse.output_text;
    messageArray.push(...assistantOutput);

    // Exit loop if no tool calls are detected
    const toolCalls = agentState.model.formatToolCall(assistantOutput);
    if (!toolCalls || toolCalls.length === 0) {
      console.log("No tool calls detected. Exiting ReAct loop.");
      break;
    }

    // Act
    for (const toolCall of toolCalls) {
      const toolResult = await callTool(toolCall);
      const toolResponse = agentState.model.formatToolResponse(toolResult);
      messageArray.push(toolResponse);
    }
    console.log("============================");
    console.log("TURN", turn);
    console.log("----------------------------");
    console.log("Assistant Output: ", assistantOutput);
    console.log("Assistant Message: ", lastAssistantContent);
    console.log("Tool Responses: ", messageArray.slice(-toolCalls.length));
    console.log("----------------------------");

    turn += 1;
  }

  const agentResponse: AgentResponse = {
    response: lastAssistantContent ?? "",
    messages: messageArray,
    step_count: turn + 1,
  };
  return agentResponse;
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
