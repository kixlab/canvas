import { OllamaRESTModel } from "../models/ollamaRestModel";
import { ModelProvider } from "../types";

const ollamaModel = new OllamaRESTModel({
  modelName: "llama3.1",
  temperature: 0.0,
  maxTokens: 4096,
  modelProvider: ModelProvider.OLLAMA,
  inputCost: 0,
  outputCost: 0,
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
