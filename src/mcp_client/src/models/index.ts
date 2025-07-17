import { OpenAIModel } from "./openaiModel";
import { AnthropicModel } from "./anthropicModel";
import { ModelConfig, ModelProvider } from "../types";
import { ModelInstance } from "./baseModel";
import { GoogleModel } from "./googleModel";
import { OllamaRESTModel } from "./ollamaModel";

export function createModel(modelConfig: ModelConfig): ModelInstance {
  switch (modelConfig.modelProvider) {
    case ModelProvider.OPENAI:
      return new OpenAIModel(modelConfig);
    case ModelProvider.ANTHROPIC:
      return new AnthropicModel(modelConfig);
    case ModelProvider.GOOGLE:
      return new GoogleModel(modelConfig);
    case ModelProvider.OLLAMA:
      return new OllamaRESTModel({
        ...modelConfig,
        baseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
      });
    default:
      throw new Error(
        `Unsupported model provider: ${modelConfig.modelProvider}`
      );
  }
}
