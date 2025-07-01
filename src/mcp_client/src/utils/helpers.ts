import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";
import { GenericMessage, ModelProvider, ServerConfig } from "../types";
import { AgentType } from "../types";

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
