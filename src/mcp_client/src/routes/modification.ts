import { Response } from "express";
import { randomUUID } from "crypto";
import { getModificationPrompt } from "../utils/prompts";
import { base64Encode, logger, reduceBase64Image } from "../utils/helpers";
import {
  AgentType,
  ContentType,
  MessageType,
  ModelProvider,
  MulterRequest,
  ResponseData,
  ResponseStatus,
  RoleType,
  UserRequestMessage,
} from "../types";
import { createAgent } from "../agents";
import { globalSession } from "../core/session";
import { createModel } from "../models";
import { ModificationAgent } from "../agents/reactModificationAgent";

type ModificationMetadata = {
  case_id: string;
  model_provider: string;
  model_name: string;
  agent_type: string;
  temperature: number;
  input_cost: number;
  output_cost: number;
  max_tokens: number;
  max_turns: number;
  max_retries?: number;
};

const requireTools = () => {
  const tools = globalSession.state.tools;
  if (!tools) throw new Error("Tools are not loaded in the session.");
  return tools;
};

const parseMetadata = (raw: string): ModificationMetadata => {
  const metadata = JSON.parse(raw) as ModificationMetadata;
  if (typeof metadata.case_id !== "string")
    throw new Error("Missing or invalid value for 'case_id'");
  if (typeof metadata.model_provider !== "string")
    throw new Error("Missing or invalid value for 'model_provider'");
  if (typeof metadata.model_name !== "string")
    throw new Error("Missing or invalid value for 'model_name'");
  if (typeof metadata.agent_type !== "string")
    throw new Error("Missing or invalid value for 'agent_type'");
  if (typeof metadata.temperature !== "number")
    throw new Error("Missing or invalid value for 'temperature'");
  if (typeof metadata.input_cost !== "number")
    throw new Error("Missing or invalid value for 'input_cost'");
  if (typeof metadata.output_cost !== "number")
    throw new Error("Missing or invalid value for 'output_cost'");
  if (typeof metadata.max_turns !== "number")
    throw new Error("Missing or invalid value for 'max_turns'");
  if (typeof metadata.max_tokens !== "number")
    throw new Error("Missing or invalid value for 'max_tokens'");
  return metadata;
};

const getConfigFromMetadata = (metadata: ModificationMetadata) => ({
  agentConfig: {
    agentType: metadata.agent_type as AgentType,
    maxTurns: metadata.max_turns,
    maxRetries: metadata.max_retries,
  },
  modelConfig: {
    modelProvider: metadata.model_provider as ModelProvider,
    modelName: metadata.model_name,
    temperature: metadata.temperature,
    inputCost: metadata.input_cost,
    outputCost: metadata.output_cost,
    maxTokens: metadata.max_tokens,
  },
});

const buildUserRequest = (
  instruction: string,
  image: { data: string; mimeType: string }
): UserRequestMessage => ({
  id: randomUUID(),
  timestamp: Date.now(),
  type: MessageType.USER_REQUEST,
  role: RoleType.USER,
  content: [
    { type: ContentType.TEXT, text: instruction },
    { type: ContentType.IMAGE, data: image.data, mimeType: image.mimeType },
  ],
});

export const runModification = async (
  req: MulterRequest,
  res: Response<ResponseData>
): Promise<void> => {
  try {
    const message = req.body.message;
    const baseJsonString = req.body.baseJsonString;
    if (!req.file) throw new Error("No image provided.");
    if (!message) throw new Error("No instruction provided.");
    const tools = requireTools();
    const metadata = parseMetadata(req.body.metadata);

    // Base JSON is required to modify an existing layout.
    const originalBase64Image = base64Encode(req.file.buffer);
    const mimeType = req.file.mimetype;
    const { base64, width, height } = await reduceBase64Image(
      originalBase64Image,
      mimeType
    );
    const instruction = getModificationPrompt(message, width, height);
    const userRequest = buildUserRequest(instruction, {
      data: base64,
      mimeType,
    });

    const { agentConfig, modelConfig } = getConfigFromMetadata(metadata);
    const agent = createAgent(agentConfig) as ModificationAgent;
    const model = createModel(modelConfig);

    const result = await agent.run({
      requestMessage: userRequest,
      tools,
      model,
      baseJsonString,
      metadata: { caseId: metadata.case_id },
    });

    res.json({
      status: ResponseStatus.SUCCESS,
      message: "Generation successful",
      payload: {
        history: result.history,
        responses: result.responses,
        cost: result.cost,
        json_structure: result.json_structure,
        image_uri: result.image_uri,
        case_id: result.case_id,
        snapshots: result.snapshots,
        turn: result.turn,
      },
    });
  } catch (error) {
    logger.error({
      header: "Error in runModification",
      body: error instanceof Error ? error.message : String(error),
    });
    res
      .status(500)
      .json({ status: ResponseStatus.ERROR, message: String(error) });
  }
};
