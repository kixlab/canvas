import { Response } from "express";
import { runSingleAgent } from "../core/agent";
import {
  getModificationWithoutOraclePrompt,
  getModificationWithOracleHierarchyPrompt,
  getModificationWithOraclePerfectCanvasPrompt,
} from "../utils/prompts";
import {
  jsonifyAgentResponse,
  base64Encode,
  createImageUrl,
} from "../utils/helpers";
import { AgentInput } from "../types";

// Modify UI without oracle
export const modifyWithoutOracle = async (
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
    const instruction = getModificationWithoutOraclePrompt(message);

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
    console.error("Error in modifyWithoutOracle:", error);
    res.status(500).json({ error: String(error) });
  }
};

// Modify UI with oracle hierarchy
export const modifyWithOracleHierarchy = async (
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
    const instruction = getModificationWithOracleHierarchyPrompt(message);

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
    console.error("Error in modifyWithOracleHierarchy:", error);
    res.status(500).json({ error: String(error) });
  }
};

// Modify UI with oracle perfect canvas
export const modifyWithOraclePerfectCanvas = async (
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
    const instruction = getModificationWithOraclePerfectCanvasPrompt(message);

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
    console.error("Error in modifyWithOraclePerfectCanvas:", error);
    res.status(500).json({ error: String(error) });
  }
};
