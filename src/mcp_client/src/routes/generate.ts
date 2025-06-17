import { Request, Response } from "express";
import { runReactAgent } from "../core/agent";
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

export const generateFromText = async (
  req: Request,
  res: Response<ResponseData>
): Promise<void> => {
  try {
    const message = req.body.message;
    const metadata = req.body.metadata || "unknown";

    if (!message) {
      res.status(400).json({
        status: ResponseStatus.ERROR,
        message: "No instruction provided.",
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

    const messageHistory = await runReactAgent(userRequest, {
      input_id: metadata,
    });

    res.json({
      status: ResponseStatus.SUCCESS,
      payload: {
        history: messageHistory,
      },
    });
  } catch (error) {
    console.error("Error in generateFromText:", error);
    res
      .status(500)
      .json({ status: ResponseStatus.ERROR, error: String(error) });
  }
};

export const generateFromImage = async (
  req: MulterRequest,
  res: Response<ResponseData>
): Promise<void> => {
  try {
    const metadata = req.body.metadata || "unknown";

    if (!req.file) {
      res
        .status(400)
        .json({ status: ResponseStatus.ERROR, message: "No image provided." });
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

    const messageHistory = await runReactAgent(userRequest, {
      input_id: metadata,
    });

    res.json({
      status: ResponseStatus.SUCCESS,
      payload: {
        history: messageHistory,
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

    const messageHistory = await runReactAgent(userRequest, {
      input_id: metadata,
    });

    res.json({
      status: ResponseStatus.SUCCESS,
      payload: {
        history: messageHistory,
      },
    });
  } catch (error) {
    console.error("Error in generateFromTextAndImage:", error);
    res
      .status(500)
      .json({ status: ResponseStatus.ERROR, message: String(error) });
  }
};
