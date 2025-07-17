import { OllamaRESTModel } from "../models/ollamaModel";
import { ModelProvider } from "../types";

const ollamaModel = new OllamaRESTModel({
  modelName: "mistral-small3.2:24b",
  temperature: 0.0,
  maxTokens: 4096,
  modelProvider: ModelProvider.OLLAMA,
  inputCost: 0,
  outputCost: 0,
  baseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
});

ollamaModel
  .generateResponse([
    {
      role: "system",
      content: "You are a helpful assistant.",
    },
    { role: "user", content: "Hello, how are you?" },
  ])
  .then((response) => {
    console.log("Response from Ollama:", response);
  })
  .catch((error) => {
    console.error("Error generating response:", error);
  });
