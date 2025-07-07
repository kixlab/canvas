import { OpenAIModel } from "./openaiModel";
import { AnthropicModel } from "./anthropicModel";
import { ModelConfig, ModelProvider } from "../types";
import { ModelInstance } from "./baseModel";
import { GoogleModel } from "./googleModel";

export function createModel(config: ModelConfig): ModelInstance {
  switch (config.provider) {
    case ModelProvider.OPENAI:
      return new OpenAIModel(config);
    case ModelProvider.ANTHROPIC:
      return new AnthropicModel(config);
    case ModelProvider.GOOGLE:
      return new GoogleModel(config);
    default:
      throw new Error(`Unsupported model provider: ${config.provider}`);
  }
}
