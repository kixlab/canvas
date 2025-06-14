import { OpenAI } from "openai";
import { ModelConfig } from "../types";

export interface ModelInstance {
  generateResponse(messages: any[], options?: any): Promise<any>;
  name: string;
  provider: string;
}

export class OpenAIModel implements ModelInstance {
  private client: OpenAI;
  public name: string;
  public provider: string;

  constructor(config: ModelConfig) {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.name = config.name;
    this.provider = config.provider;
  }

  async generateResponse(messages: any[], options: any = {}): Promise<any> {
    const response = await this.client.chat.completions.create({
      model: this.name,
      messages: messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 4096,
      ...options,
    });

    return response;
  }
}

export class AnthropicModel implements ModelInstance {
  public name: string;
  public provider: string;

  constructor(config: ModelConfig) {
    this.name = config.name;
    this.provider = config.provider;
  }

  async generateResponse(messages: any[], options: any = {}): Promise<any> {
    console.warn(
      "Anthropic model not fully implemented, using OpenAI fallback"
    );
    const openaiModel = new OpenAIModel({
      name: "gpt-4",
      provider: "openai",
    });
    return openaiModel.generateResponse(messages, options);
  }
}

export function getModel(config: ModelConfig): ModelInstance {
  switch (config.provider.toLowerCase()) {
    case "openai":
      return new OpenAIModel(config);
    case "anthropic":
      return new AnthropicModel(config);
    default:
      throw new Error(`Unsupported model provider: ${config.provider}`);
  }
}
