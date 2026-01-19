import { OpenAIModel } from "./openaiModel";
import { BedrockModel } from "./bedrockModel";
import { ModelConfig, ModelProvider } from "../types";
import { ModelInstance } from "./modelInstance";
import { GoogleModel } from "./googleModel";
import { OllamaRESTModel } from "./ollamaModel";

// Model factory used by agents/routes.
export function createModel(modelConfig: ModelConfig): ModelInstance {
  switch (modelConfig.modelProvider) {
    case ModelProvider.OPENAI:
      return new OpenAIModel(modelConfig);
    case ModelProvider.AMAZON:
      return new BedrockModel(modelConfig);
    case ModelProvider.GOOGLE:
      return new GoogleModel(modelConfig);
    case ModelProvider.OLLAMA: {
      const baseUrl = process.env.OLLAMA_BASE_URL;
      if (!baseUrl) {
        throw new Error("OLLAMA_BASE_URL is required for Ollama models");
      }
      return new OllamaRESTModel({ ...modelConfig, baseUrl });
    }
    default:
      throw new Error(
        `Unsupported model provider: ${modelConfig.modelProvider}`
      );
  }
}
