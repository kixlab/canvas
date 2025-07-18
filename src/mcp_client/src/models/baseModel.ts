import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import {
  ModelConfig,
  ModelProvider,
  CallToolRequestParams,
  GenericMessage,
} from "../types";

export abstract class ModelInstance {
  modelName: string;
  modelProvider: ModelProvider;
  inputCost: number;
  outputCost: number;
  temperature: number;
  maxTokens: number;

  constructor(config: ModelConfig) {
    this.modelName = config.modelName;
    this.modelProvider = config.modelProvider;
    this.inputCost = config.inputCost;
    this.outputCost = config.outputCost;
    this.temperature = config.temperature;
    this.maxTokens = config.maxTokens;
  }

  // Core methods
  abstract generateResponse(messages: any[], options?: any): Promise<any>;
  abstract generateResponseWithTool(
    messages: any[],
    tools: any[],
    options?: any
  ): Promise<any>;

  // Formatting methods
  abstract formatRequest(messages: GenericMessage[]): any[];
  abstract formatCallToolRequest(response: any): CallToolRequestParams[];
  abstract formatToolList(
    tools: Awaited<ReturnType<Client["listTools"]>>["tools"]
  ): any[];
  abstract formatToolResponse(response: CallToolResult): any;
  abstract formatImageData(imageData: string, mimeType?: string): string;
  abstract formatResponseToIntermediateRequestMessage(
    response: any
  ): GenericMessage;

  // Context management
  abstract createMessageContext(): any[];
  abstract addToApiMessageContext(response: any, context: any[]): void;
  abstract addToFormattedMessageContext(response: any, context: any[]): void;

  // Cost calculation
  abstract getCostFromResponse(response: any): number;
}
