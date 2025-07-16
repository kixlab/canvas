import { OpenAIModel } from "./openaiModel";
import { AnthropicModel } from "./anthropicModel";
import { ModelConfig, ModelProvider } from "../types";
import { ModelInstance } from "./baseModel";
import { GoogleModel } from "./googleModel";
import { OllamaModel } from "./ollamaModel";
import { OllamaRESTModel } from "./ollamaRestModel";

export function createModel(modelConfig: ModelConfig): ModelInstance {
  switch (modelConfig.modelProvider) {
    case ModelProvider.OPENAI:
      return new OpenAIModel(modelConfig);
    case ModelProvider.ANTHROPIC:
      return new AnthropicModel(modelConfig);
    case ModelProvider.GOOGLE:
      return new GoogleModel(modelConfig);
    case ModelProvider.OLLAMA:
      // return new OllamaModel(modelConfig);
      return new OllamaRESTModel(modelConfig);
    default:
      throw new Error(
        `Unsupported model provider: ${modelConfig.modelProvider}`
      );
  }
}
