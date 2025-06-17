import { Response } from "express";
import { runReactAgent } from "../core/agent";
import {
  getModificationWithoutOraclePrompt,
  getModificationWithOracleHierarchyPrompt,
  getModificationWithOraclePerfectCanvasPrompt,
} from "../utils/prompts";
import { base64Encode, createImageUrl } from "../utils/helpers";
import {
  ContentType,
  MessageType,
  ResponseData,
  ResponseStatus,
  RoleType,
  UserRequestMessage,
} from "../types";
import { randomUUID } from "crypto";

// Modify UI without oracle
export const modifyWithoutOracle = async (
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
    const instruction = getModificationWithoutOraclePrompt(message);

    const userRequest: UserRequestMessage = {
      id: randomUUID(),
      timestamp: Date.now(),
      type: MessageType.USER_REQUEST,
      role: RoleType.USER,
      content: [
        { type: ContentType.TEXT, text: instruction },
        {
          type: ContentType.IMAGE,
          data: createImageUrl(base64Image),
          mimeType: req.file.mimetype,
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
    console.error("Error in modifyWithoutOracle:", error);
    res
      .status(500)
      .json({ status: ResponseStatus.ERROR, message: String(error) });
  }
};

// Modify UI with oracle hierarchy
export const modifyWithOracleHierarchy = async (
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
    const instruction = getModificationWithOracleHierarchyPrompt(message);

    const userRequest: UserRequestMessage = {
      id: randomUUID(),
      timestamp: Date.now(),
      type: MessageType.USER_REQUEST,
      role: RoleType.USER,
      content: [
        { type: ContentType.TEXT, text: instruction },
        {
          type: ContentType.IMAGE,
          data: createImageUrl(base64Image),
          mimeType: req.file.mimetype,
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
    console.error("Error in modifyWithOracleHierarchy:", error);
    res
      .status(500)
      .json({ status: ResponseStatus.ERROR, message: String(error) });
  }
};

// Modify UI with oracle perfect canvas
export const modifyWithOraclePerfectCanvas = async (
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
    const instruction = getModificationWithOraclePerfectCanvasPrompt(message);

    const userRequest: UserRequestMessage = {
      id: randomUUID(),
      timestamp: Date.now(),
      type: MessageType.USER_REQUEST,
      role: RoleType.USER,
      content: [
        { type: ContentType.TEXT, text: instruction },
        {
          type: ContentType.IMAGE,
          data: createImageUrl(base64Image),
          mimeType: req.file.mimetype,
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
    console.error("Error in modifyWithOraclePerfectCanvas:", error);
    res
      .status(500)
      .json({ status: ResponseStatus.ERROR, error: String(error) });
  }
};
