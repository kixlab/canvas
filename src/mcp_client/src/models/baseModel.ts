import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { OpenAIModel } from "./openaiModel";
import { AnthropicModel } from "./anthropicModel";
import {
  ModelConfig,
  ModelProvider,
  CallToolRequestParams,
  GenericMessage,
} from "../types";

export interface ModelInstance {
  name: string;
  provider: ModelProvider;
  inputCost: number;
  outputCost: number;

  // Core methods
  generateResponse(messages: any[], options?: any): Promise<any>;
  generateResponseWithTool(
    messages: any[],
    tools: any[],
    options?: any
  ): Promise<any>;

  // Formatting methods
  formatRequest(messages: GenericMessage[]): any[];
  formatCallToolRequest(response: any): CallToolRequestParams[];
  formatToolList(
    tools: Awaited<ReturnType<Client["listTools"]>>["tools"]
  ): any[];
  formatToolResponse(response: CallToolResult): any;
  formatImageData(imageData: string, mimeType?: string): string;

  // Context management
  createMessageContext(): any[];
  addToApiMessageContext(response: any, context: any[]): void;
  addToFormattedMessageContext(response: any, context: any[]): void;

  // Cost calculation
  getCostFromResponse(response: any): number;
}

export function createModel(config: ModelConfig): ModelInstance {
  switch (config.provider) {
    case ModelProvider.OPENAI:
      return new OpenAIModel(config);
    case ModelProvider.ANTHROPIC:
      return new AnthropicModel(config);
    default:
      throw new Error(`Unsupported model provider: ${config.provider}`);
  }
}
