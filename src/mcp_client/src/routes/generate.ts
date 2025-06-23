import { Request, Response } from "express";
import {
  getTextBasedGenerationPrompt,
  getImageBasedGenerationPrompt,
  getTextImageBasedGenerationPrompt,
} from "../utils/prompts";
import { base64Encode, createImageUrl } from "../utils/helpers";
import {
  ContentType,
  MessageType,
  MulterRequest,
  ResponseData,
  ResponseStatus,
  RoleType,
  UserRequestMessage,
} from "../types";
import { randomUUID } from "crypto";
import { createAgent } from "../agents";
import { globalSession } from "../core/session";

export const generateFromText = async (
  req: Request,
  res: Response<ResponseData>
): Promise<void> => {
  try {
    const message = req.body.message;
    const metadata = req.body.metadata || "unknown";
    const sessionState = globalSession.state;

    if (!message) {
      res.status(400).json({
        status: ResponseStatus.ERROR,
        message: "No instruction provided.",
      });
      return;
    }

    if (!sessionState.agentType || !sessionState.tools || !sessionState.model) {
      res.status(500).json({
        status: ResponseStatus.ERROR,
        message: "The session is not properly initialized.",
      });
      return;
    }

    const instruction = getTextBasedGenerationPrompt(message);
    const userRequest: UserRequestMessage = {
      id: randomUUID(),
      timestamp: Date.now(),
      type: MessageType.USER_REQUEST,
      role: RoleType.USER,
      content: [{ type: ContentType.TEXT, text: instruction }],
    };

    const agent = createAgent(sessionState.agentType);

    const { history, responses, cost } = await agent.run({
      requestMessage: userRequest,
      tools: sessionState.tools,
      model: sessionState.model,
      metadata: { input_id: metadata },
    });

    res.json({
      status: ResponseStatus.SUCCESS,
      message: "Generation successful",
      payload: {
        history,
        responses,
        cost, // Cost in USD
      },
    });
  } catch (error) {
    console.error("Error in generateFromText:", error);
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
    const metadata = req.body.metadata || "unknown";
    const sessionState = globalSession.state;

    if (!req.file) {
      res
        .status(400)
        .json({ status: ResponseStatus.ERROR, message: "No image provided." });
      return;
    }

    if (!sessionState.agentType || !sessionState.tools || !sessionState.model) {
      res.status(500).json({
        status: ResponseStatus.ERROR,
        message: "The session is not properly initialized.",
      });
      return;
    }

    const base64Image = base64Encode(req.file.buffer);
    const instruction = getImageBasedGenerationPrompt();
    const mimeType = req.file.mimetype;

    const userRequest: UserRequestMessage = {
      id: randomUUID(),
      timestamp: Date.now(),
      type: MessageType.USER_REQUEST,
      role: RoleType.USER,
      content: [
        { type: ContentType.TEXT, text: instruction },
        {
          type: ContentType.IMAGE,
          data: createImageUrl(base64Image, mimeType),
          mimeType: mimeType,
        },
      ],
    };

    const agent = createAgent(sessionState.agentType);

    const { history, responses, cost } = await agent.run({
      requestMessage: userRequest,
      tools: sessionState.tools,
      model: sessionState.model,
      metadata: { input_id: metadata },
    });

    res.json({
      status: ResponseStatus.SUCCESS,
      message: "Generation successful",
      payload: {
        history,
        responses,
        cost, // Cost in USD
      },
    });
  } catch (error) {
    console.error("Error in generateFromImage:", error);
    res
      .status(500)
      .json({ status: ResponseStatus.ERROR, message: String(error) });
  }
};

// Generate UI from text + image
export const generateFromTextAndImage = async (
  req: any,
  res: Response<ResponseData>
): Promise<void> => {
  try {
    const message = req.body.message;
    const metadata = req.body.metadata || "unknown";
    const sessionState = globalSession.state;

    if (!req.file) {
      res
        .status(400)
        .json({ status: ResponseStatus.ERROR, message: "No image provided." });
      return;
    }

    if (!message) {
      res.status(400).json({
        status: ResponseStatus.ERROR,
        message: "No instruction provided.",
      });
      return;
    }

    if (!sessionState.agentType || !sessionState.tools || !sessionState.model) {
      res.status(500).json({
        status: ResponseStatus.ERROR,
        message: "The session is not properly initialized.",
      });
      return;
    }

    const base64Image = base64Encode(req.file.buffer);
    const instruction = getTextImageBasedGenerationPrompt(message);
    const mimeType = req.file.mimetype;

    const userRequest: UserRequestMessage = {
      id: randomUUID(),
      timestamp: Date.now(),
      type: MessageType.USER_REQUEST,
      role: RoleType.USER,
      content: [
        { type: ContentType.TEXT, text: instruction },
        {
          type: ContentType.IMAGE,
          data: createImageUrl(base64Image, mimeType),
          mimeType: mimeType,
        },
      ],
    };

    const agent = createAgent(sessionState.agentType);

    const { history, responses, cost } = await agent.run({
      requestMessage: userRequest,
      tools: sessionState.tools,
      model: sessionState.model,
      metadata: { input_id: metadata },
    });

    res.json({
      status: ResponseStatus.SUCCESS,
      message: "Generation successful",
      payload: {
        history,
        responses,
        cost, // Cost in USD
      },
    });
  } catch (error) {
    console.error("Error in generateFromTextAndImage:", error);
    res
      .status(500)
      .json({ status: ResponseStatus.ERROR, message: String(error) });
  }
};
