import { Request, Response } from "express";
import {
  getTextBasedGenerationPrompt,
  getImageBasedGenerationPrompt,
  getTextImageBasedGenerationPrompt,
} from "../utils/prompts";
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
import { randomUUID } from "crypto";
import { createAgent } from "../agents";
import { globalSession } from "../core/session";
import { createModel } from "../models";

export const generateFromText = async (
  req: Request,
  res: Response<ResponseData>
): Promise<void> => {
  try {
    const message = req.body.message;
    const metadata = JSON.parse(req.body.metadata) as GenerateMetadata;
    const sessionState = globalSession.state;

    // (1) Request Validation
    if (!message) {
      throw new Error("No instruction provided.");
    }
    if (!sessionState.tools) {
      throw new Error("Tools are not loaded in the session.");
    }
    validateMetadata(metadata);

    // (2) Request Formulation
    const instruction = getTextBasedGenerationPrompt(message);
    const userRequest: UserRequestMessage = {
      id: randomUUID(),
      timestamp: Date.now(),
      type: MessageType.USER_REQUEST,
      role: RoleType.USER,
      content: [{ type: ContentType.TEXT, text: instruction }],
    };

    // (3) Agent Creation
    const { agentConfig, modelConfig } = getConfigFromMetadata(metadata);
    const agent = createAgent(agentConfig);
    const model = createModel(modelConfig);

    const {
      history,
      responses,
      cost,
      json_structure,
      image_uri,
      case_id,
      snapshots,
      turn,
    } = await agent.run({
      requestMessage: userRequest,
      tools: sessionState.tools,
      model: model,
      metadata: { caseId: metadata.case_id },
    });

    res.json({
      status: ResponseStatus.SUCCESS,
      message: "Generation successful",
      payload: {
        history,
        responses,
        json_structure,
        image_uri,
        case_id,
        snapshots,
        turn,
        cost, // Cost in USD
      },
    });
  } catch (error) {
    logger.error({
      header: "Error in generateFromText",
      body: error instanceof Error ? error.message : String(error),
    });
    res
      .status(500)
      .json({ status: ResponseStatus.ERROR, message: String(error) });
  }
};

export const generateFromImage = async (
  req: MulterRequest,
  res: Response<ResponseData>
): Promise<void> => {
  try {
    const metadata = JSON.parse(req.body.metadata) as GenerateMetadata;
    const sessionState = globalSession.state;

    // (1) Request Validation
    if (!req.file) {
      throw new Error("No image provided.");
    }
    if (!sessionState.tools) {
      throw new Error("Tools are not loaded in the session.");
    }
    validateMetadata(metadata);

    // (2) Request Formulation
    const originalBase64Image = base64Encode(req.file.buffer);
    const mimeType = req.file.mimetype;
    const { base64, width, height } = await reduceBase64Image(
      originalBase64Image,
      mimeType
    );

    const instruction = getImageBasedGenerationPrompt(width, height);

    const userRequest: UserRequestMessage = {
      id: randomUUID(),
      timestamp: Date.now(),
      type: MessageType.USER_REQUEST,
      role: RoleType.USER,
      content: [
        { type: ContentType.TEXT, text: instruction },
        {
          type: ContentType.IMAGE,
          data: base64,
          mimeType: mimeType,
        },
      ],
    };

    // (3) Agent Creation
    const { agentConfig, modelConfig } = getConfigFromMetadata(metadata);
    const agent = createAgent(agentConfig);
    const model = createModel(modelConfig);

    const {
      history,
      responses,
      cost,
      json_structure,
      image_uri,
      case_id,
      snapshots,
      turn,
    } = await agent.run({
      requestMessage: userRequest,
      tools: sessionState.tools,
      model: model,
      metadata: { caseId: metadata.case_id },
    });

    res.json({
      status: ResponseStatus.SUCCESS,
      message: "Generation successful",
      payload: {
        history,
        responses,
        cost, // Cost in USD
        json_structure,
        image_uri,
        case_id,
        snapshots,
        turn,
      },
    });
  } catch (error) {
    logger.error({
      header: "Error in generateFromImage",
      body: error instanceof Error ? error.message : String(error),
    });
    res
      .status(500)
      .json({ status: ResponseStatus.ERROR, message: String(error) });
  }
};

export const generateFromTextAndImage = async (
  req: MulterRequest,
  res: Response<ResponseData>
): Promise<void> => {
  try {
    const message = req.body.message;
    const metadata = JSON.parse(req.body.metadata) as GenerateMetadata;
    const sessionState = globalSession.state;

    // (1) Request Validation
    if (!req.file) {
      throw new Error("No image provided.");
    }
    if (!message) {
      throw new Error("No instruction provided.");
    }
    if (!sessionState.tools) {
      throw new Error("Tools are not loaded in the session.");
    }
    validateMetadata(metadata);

    // (2) Request Formulation
    const originalBase64Image = base64Encode(req.file.buffer);
    const mimeType = req.file.mimetype;
    const { base64, width, height } = await reduceBase64Image(
      originalBase64Image,
      mimeType
    );
    const instruction = getTextImageBasedGenerationPrompt(
      message,
      width,
      height
    );

    const userRequest: UserRequestMessage = {
      id: randomUUID(),
      timestamp: Date.now(),
      type: MessageType.USER_REQUEST,
      role: RoleType.USER,
      content: [
        { type: ContentType.TEXT, text: instruction },
        {
          type: ContentType.IMAGE,
          data: base64,
          mimeType: mimeType,
        },
      ],
    };

    // (3) Agent Creation
    const { agentConfig, modelConfig } = getConfigFromMetadata(metadata);
    const agent = createAgent(agentConfig);
    const model = createModel(modelConfig);

    const {
      history,
      responses,
      cost,
      json_structure,
      image_uri,
      case_id,
      snapshots,
      turn,
    } = await agent.run({
      requestMessage: userRequest,
      tools: sessionState.tools,
      model: model,
      metadata: { caseId: metadata.case_id },
    });

    res.json({
      status: ResponseStatus.SUCCESS,
      message: "Generation successful",
      payload: {
        history,
        responses,
        cost, // Cost in USD
        json_structure,
        image_uri,
        case_id,
        snapshots,
        turn,
      },
    });
  } catch (error) {
    logger.error({
      header: "Error in generateFromTextAndImage",
      body: error instanceof Error ? error.message : String(error),
    });
    res
      .status(500)
      .json({ status: ResponseStatus.ERROR, message: String(error) });
  }
};
interface GenerateMetadata {
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
}

function validateMetadata(
  metadata: GenerateMetadata
): metadata is GenerateMetadata {
  if (typeof metadata.case_id !== "string") {
    throw new Error("Missing or invalid value for 'case_id'");
  }
  if (typeof metadata.model_provider !== "string") {
    throw new Error("Missing or invalid value for 'model_provider'");
  }
  if (typeof metadata.model_name !== "string") {
    throw new Error("Missing or invalid value for 'model_name'");
  }
  if (typeof metadata.agent_type !== "string") {
    throw new Error("Missing or invalid value for 'agent_type'");
  }
  if (typeof metadata.temperature !== "number") {
    throw new Error("Missing or invalid value for 'temperature'");
  }
  if (typeof metadata.input_cost !== "number") {
    throw new Error("Missing or invalid value for 'input_cost'");
  }
  if (typeof metadata.output_cost !== "number") {
    throw new Error("Missing or invalid value for 'output_cost'");
  }
  if (typeof metadata.max_turns !== "number") {
    throw new Error("Missing or invalid value for 'max_turns'");
  }
  if (typeof metadata.max_tokens !== "number") {
    throw new Error("Missing or invalid value for 'max_tokens'");
  }
  return true;
}

function getConfigFromMetadata(metadata: GenerateMetadata): {
  agentConfig: { agentType: AgentType; maxTurns: number; maxRetries?: number };
  modelConfig: {
    modelProvider: ModelProvider;
    modelName: string;
    temperature: number;
    inputCost: number;
    outputCost: number;
    maxTokens: number;
  };
} {
  return {
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
  };
}
