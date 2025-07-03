import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";
import {
  UserRequestMessage,
  ModelProvider,
  ServerConfig,
  ContentType,
  CallToolRequestParams,
} from "../types";
import { AgentType } from "../types";
import { Tools } from "../core/tools";
import { randomUUID } from "crypto";
import { Image } from "@napi-rs/canvas";

// Utility functions for the MCP client

export interface Message {
  role: string;
  content: any;
  id?: string;
}

export function messageTypeToRole(message: any): string {
  if (!message) return "system";

  if (message.role) {
    return message.role;
  }

  if (message.type) {
    switch (message.type) {
      case "human":
        return "user";
      case "ai":
        return "assistant";
      case "tool":
        return "tool";
      default:
        return "system";
    }
  }

  // Fallback based on constructor name or other properties
  const className = message.constructor?.name || "";
  if (className.includes("Human")) return "user";
  if (className.includes("AI")) return "assistant";
  if (className.includes("Tool")) return "tool";

  return "system";
}

export function base64Encode(buffer: Buffer): string {
  return buffer.toString("base64");
}

export function createImageUrl(
  base64Data: string,
  mimeType: string = "image/png"
): string {
  return `data:${mimeType};base64,${base64Data}`;
}

export function loadServerConfig(
  agentType: AgentType = AgentType.REACT
): ServerConfig {
  const configPath = path.join(
    __dirname,
    "..",
    "..",
    "config",
    `server_${agentType}.yaml`
  );

  try {
    const configFile = fs.readFileSync(configPath, "utf8");
    const config = yaml.parse(configFile) as ServerConfig;

    return config;
  } catch (error) {
    const baseConfigPath = path.join(
      __dirname,
      ".",
      "config",
      "server_base.yaml"
    );
    try {
      console.warn("Failed to loead config from: ", configPath);
      const configFile = fs.readFileSync(baseConfigPath, "utf8");
      const config = yaml.parse(configFile) as ServerConfig;
      return config;
    } catch (baseError) {
      console.warn("Failed to load base config from: ", baseConfigPath);
      // Default configuration
      return {
        models: [
          {
            name: "gpt-4.1-2025-04-14",
            provider: ModelProvider.OPENAI,
            temperature: 1.0,
            max_tokens: 32768,
            input_cost: 0.002,
            output_cost: 0.008,
            max_turns: 100,
            max_retries: 3,
          },
        ],
        agent_type: agentType,
      };
    }
  }
}

export const intializeMainScreenFrame = async (
  requestMessage: UserRequestMessage,
  tools: Tools
) => {
  try {
    let canvasWidth = 393; // Default canvas width
    let canvasHeight = 852; // Default canvas height

    if (requestMessage.content.length > 0) {
      for (const content of requestMessage.content) {
        if (content.type === ContentType.IMAGE) {
          const image = content.data;
          const img = new Image();
          img.src = `data:${content.mimeType};base64,${image}`;
          await new Promise<void>((resolve, reject) => {
            img.onload = () => {
              canvasWidth = img.width;
              canvasHeight = img.height;
              resolve();
            };
            img.onerror = reject;
          });
          break;
        }
      }
    }

    const initializeMainScreenFrameToolCall = tools.createToolCall(
      "create_frame",
      randomUUID(),
      {
        x: 0,
        y: 0,
        width: canvasWidth,
        height: canvasHeight,
        name: "Main Screen",
        fillColor: { r: 1, g: 1, b: 1, a: 1 },
      }
    );
    const result = await tools.callTool(initializeMainScreenFrameToolCall);

    if (result.isError || !result.structuredContent?.id) {
      throw new Error("Failed to create root frame");
    }

    const mainScreenFrameId = (result.structuredContent?.id as string).trim();
    const width = result.structuredContent?.width;
    const height = result.structuredContent?.height;

    return {
      mainScreenFrameId,
      width,
      height,
    };
  } catch (error) {
    throw new Error(
      `Error initializing root frame: ${(error as Error).message}`
    );
  }
};

const traverseTree = (node: any, elementTypes: Map<string, string>) => {
  if (node.id && node.type) {
    elementTypes.set(node.id, node.type);
  }
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      traverseTree(child, elementTypes);
    }
  }
};

export const switchParentId = async ({
  tools,
  callToolRequests,
  mainScreenFrameId,
}: {
  tools: Tools;
  callToolRequests: CallToolRequestParams[];
  mainScreenFrameId: string;
}) => {
  const CORRECT_PARENT_TYPES = ["FRAME", "GROUP", "SECTION"];
  const DOCUMENT_TYPES = ["DOCUMENT", "PAGE"];

  // Build list of element with their types
  const getStructureCall = tools.createToolCall(
    "get_page_structure",
    randomUUID(),
    {}
  );
  const res = await tools.callTool(getStructureCall);
  if (res.isError || !res.structuredContent?.structureTree) {
    throw new Error(`Failed to switch parent ID: ${res.error}`);
  }
  if (!res.structuredContent?.structureTree) {
    throw new Error(
      "Failed to switch parent ID: No structure tree found in the response"
    );
  }

  const elementTree = res.structuredContent.structureTree as Array<object>;
  const elementTypes = new Map<string, string>();
  for (const node of elementTree) {
    traverseTree(node, elementTypes);
  }

  for (const toolCall of callToolRequests) {
    const toolArguments = toolCall.arguments || {};
    const hasParentIdArg = tools.catalogue
      .get(toolCall.name)
      ?.inputSchema.properties!.hasOwnProperty("parentId");

    // Parent ID Validation
    if (hasParentIdArg && toolArguments.parentId) {
      const parentId = toolArguments.parentId as string;
      const parentType = elementTypes.get(parentId);
      let warning: string | null = null;

      if (!parentType) {
        warning = `parentId ${parentId} does not exist in the structure tree.`;
      } else if (!CORRECT_PARENT_TYPES.includes(parentType)) {
        warning = `parentId ${parentId} has invalid type: ${parentType}.`;
      } else if (DOCUMENT_TYPES.includes(parentType) || parentId === "0:1") {
        warning = `parentId ${parentId} is of forbidden type ${parentType}.`;
      }

      if (warning) {
        console.warn(`Tool call ${toolCall.name}: ${warning}`);
        toolArguments.parentId = mainScreenFrameId;
        continue;
      }
    }

    // Main Screen Insertion
    if (hasParentIdArg && !toolArguments.parentId) {
      toolArguments["parentId"] = mainScreenFrameId;
    }
  }
};
