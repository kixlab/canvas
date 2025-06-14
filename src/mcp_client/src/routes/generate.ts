import { Request, Response } from "express";
import { runSingleAgent } from "../core/agent";
import {
  getTextBasedGenerationPrompt,
  getImageBasedGenerationPrompt,
  getTextImageBasedGenerationPrompt,
} from "../utils/prompts";
import {
  jsonifyAgentResponse,
  base64Encode,
  createImageUrl,
} from "../utils/helpers";
import { ChatRequest, AgentInput } from "../types";
import { MulterRequest } from "../types";

export const generateFromText = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const chatRequest: ChatRequest = req.body;
    const metadata = req.body.metadata || "unknown";

    if (!chatRequest.message) {
      res.status(400).json({ error: "No instruction provided." });
      return;
    }

    const instruction = getTextBasedGenerationPrompt(chatRequest.message);
    const agentInput: AgentInput[] = [{ type: "text", text: instruction }];

    const response = await runSingleAgent(agentInput, {
      input_id: metadata,
    });

    const stepCount = response.messages ? response.messages.length - 1 : 0;
    const jsonResponse = jsonifyAgentResponse(response);

    res.json({
      response: response.response,
      json_response: jsonResponse,
      step_count: stepCount,
    });
  } catch (error) {
    console.error("Error in generateFromText:", error);
    res.status(500).json({ error: String(error) });
  }
};

export const generateFromImage = async (
  req: MulterRequest,
  res: Response
): Promise<void> => {
  try {
    const metadata = req.body.metadata || "unknown";

    if (!req.file) {
      res.status(400).json({ error: "No image provided." });
      return;
    }

    const base64Image = base64Encode(req.file.buffer);
    const instruction = getImageBasedGenerationPrompt();

    const agentInput: AgentInput[] = [
      { type: "text", text: instruction },
      {
        type: "image_url",
        image_url: {
          url: createImageUrl(base64Image),
          detail: "auto",
        },
      },
    ];

    const response = await runSingleAgent(agentInput, {
      input_id: metadata,
    });

    const stepCount = response.messages ? response.messages.length - 1 : 0;
    const jsonResponse = jsonifyAgentResponse(response);

    res.json({
      response: response.response,
      json_response: jsonResponse,
      step_count: stepCount,
    });
  } catch (error) {
    console.error("Error in generateFromImage:", error);
    res.status(500).json({ error: String(error) });
  }
};

// Generate UI from text + image
export const generateFromTextAndImage = async (
  req: any,
  res: Response
): Promise<void> => {
  try {
    const message = req.body.message;
    const metadata = req.body.metadata || "unknown";

    if (!req.file) {
      res.status(400).json({ error: "No image provided." });
      return;
    }

    if (!message) {
      res.status(400).json({ error: "No instruction provided." });
      return;
    }

    const base64Image = base64Encode(req.file.buffer);
    const instruction = getTextImageBasedGenerationPrompt(message);

    const agentInput: AgentInput[] = [
      { type: "text", text: instruction },
      {
        type: "image_url",
        image_url: {
          url: createImageUrl(base64Image),
          detail: "auto",
        },
      },
    ];

    const response = await runSingleAgent(agentInput, {
      input_id: metadata,
    });

    const stepCount = response.messages ? response.messages.length - 1 : 0;
    const jsonResponse = jsonifyAgentResponse(response);

    res.json({
      response: response.response,
      json_response: jsonResponse,
      step_count: stepCount,
    });
  } catch (error) {
    console.error("Error in generateFromTextAndImage:", error);
    res.status(500).json({ error: String(error) });
  }
};
