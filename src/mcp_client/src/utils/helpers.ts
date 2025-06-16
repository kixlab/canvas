import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";
import { ModelProvider, ServerConfig } from "../types";

// Utility functions for the MCP client

export interface Message {
  role: string;
  content: any;
  id?: string;
}

export interface JsonifiedResponse {
  main_content: string;
  messages: Message[];
  images: string[];
  error?: string;
}

export function jsonifyAgentResponse(response: any): JsonifiedResponse {
  const result: JsonifiedResponse = {
    main_content: "",
    messages: [],
    images: [],
  };

  if (response?.messages && Array.isArray(response.messages)) {
    for (const msg of response.messages) {
      const messageData: Message = {
        role: messageTypeToRole(msg),
        content: "",
        id: msg.id || "",
      };

      if (msg.content) {
        messageData.content = msg.content;
      }
      result.messages.push(messageData);
    }
  }

  if (typeof response === "string") {
    result.main_content = response;
  } else {
    try {
      result.main_content = String(response);
      if (response?.content) {
        result.main_content = response.content;
      }
    } catch (error) {
      result.error = `Could not parse response: ${error}`;
    }
  }

  return result;
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

export function loadServerConfig(agentType: string = "single"): ServerConfig {
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
            name: "claude-3-5-sonnet-20241022",
            provider: ModelProvider.ANTHROPIC,
            temperature: 0.7,
            max_tokens: 4096,
          },
        ],
        agent_type: agentType,
      };
    }
  }
}
