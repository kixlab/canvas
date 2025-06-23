import { OpenAIModel } from "./openaiModel";
import { AnthropicModel } from "./anthropicModel";
import { ModelConfig, ModelProvider } from "../types";
import { ModelInstance } from "./baseModel";

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
