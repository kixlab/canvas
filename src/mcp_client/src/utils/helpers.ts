import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";
import {
  UserRequestMessage,
  ModelProvider,
  ServerConfig,
  ContentType,
  CallToolRequestParams,
} from "../types";
import { AgentType } from "../types";
import { Tools } from "../core/tools";
import { randomUUID } from "crypto";
import { Canvas, Image } from "@napi-rs/canvas";

export interface Message {
  role: string;
  content: any;
  id?: string;
}

export function messageTypeToRole(message: any): string {
  if (!message) return "system";

  if (message.role) {
    return message.role;
  }

  if (message.type) {
    switch (message.type) {
      case "human":
        return "user";
      case "ai":
        return "assistant";
      case "tool":
        return "tool";
      default:
        return "system";
    }
  }

  // Fallback based on constructor name or other properties
  const className = message.constructor?.name || "";
  if (className.includes("Human")) return "user";
  if (className.includes("AI")) return "assistant";
  if (className.includes("Tool")) return "tool";

  return "system";
}

export function base64Encode(buffer: Buffer): string {
  return buffer.toString("base64");
}

export function createImageUrl(
  base64Data: string,
  mimeType: string = "image/png"
): string {
  return `data:${mimeType};base64,${base64Data}`;
}

export const intializeMainScreenFrame = async (
  requestMessage: UserRequestMessage,
  tools: Tools
) => {
  try {
    let canvasWidth = 393; // Default canvas width
    let canvasHeight = 852; // Default canvas height

    if (requestMessage.content.length > 0) {
      for (const content of requestMessage.content) {
        if (content.type === ContentType.IMAGE) {
          const image = content.data;
          const img = new Image();
          img.src = `data:${content.mimeType};base64,${image}`;
          await new Promise<void>((resolve, reject) => {
            img.onload = () => {
              canvasWidth = img.width;
              canvasHeight = img.height;
              resolve();
            };
            img.onerror = reject;
          });
          break;
        }
      }
    }

    const initializeMainScreenFrameToolCall = tools.createToolCall(
      "create_frame",
      randomUUID(),
      {
        x: 0,
        y: 0,
        width: canvasWidth,
        height: canvasHeight,
        name: "Main Screen",
        fillColor: { r: 1, g: 1, b: 1, a: 1 },
      }
    );
    const result = await tools.callTool(initializeMainScreenFrameToolCall);

    if (result.isError || !result.structuredContent?.id) {
      throw new Error("Failed to create root frame");
    }

    const mainScreenFrameId = (result.structuredContent?.id as string).trim();
    const width = result.structuredContent?.width as number;
    const height = result.structuredContent?.height as number;

    if (!mainScreenFrameId || !width || !height) {
      throw new Error("Invalid response from create_frame tool");
    }

    return {
      mainScreenFrameId,
      width,
      height,
    };
  } catch (error) {
    throw new Error(
      `Error initializing root frame: ${(error as Error).message}`
    );
  }
};

export const reduceBase64Image = async (
  base64Image: string,
  mimeType: string = "image/png",
  maxHeight: number = 1024
): Promise<{ base64: string; width: number; height: number }> => {
  // 1.  Load the image from the Base-64 string.
  const img = new Image();
  img.src = `data:${mimeType};base64,${base64Image}`;

  return new Promise((resolve, reject) => {
    img.onload = () => {
      let { width, height } = img;

      // 2.  Decide whether resizing is necessary.
      if (height > maxHeight) {
        const scale = maxHeight / height;
        width = Math.round(width * scale);
        height = maxHeight;
      }

      // 3.  Draw (and implicitly resample) to a canvas.
      const canvas = new Canvas(width, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Unable to obtain 2-D canvas context."));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      // 4. String type check.
      const allowedMimeTypes = [
        "image/png",
        "image/jpeg",
        "image/webp",
      ] as const;
      const safeMimeType = allowedMimeTypes.includes(mimeType as any)
        ? (mimeType as "image/png" | "image/jpeg" | "image/webp")
        : "image/png";
      const resizedBase64 = canvas
        .toDataURL(safeMimeType)
        .replace(`data:${safeMimeType};base64,`, "");

      resolve({ base64: resizedBase64, width, height });
    };

    img.onerror = (err) => reject(new Error(`Failed to load image: ${err}`));
  });
};
const traverseTree = (node: any, elementTypes: Map<string, string>) => {
  if (node.id && node.type) {
    elementTypes.set(node.id, node.type);
  }
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      traverseTree(child, elementTypes);
    }
  }
};

export const switchParentId = async ({
  tools,
  callToolRequests,
  mainScreenFrameId,
}: {
  tools: Tools;
  callToolRequests: CallToolRequestParams[];
  mainScreenFrameId: string;
}) => {
  const CORRECT_PARENT_TYPES = ["FRAME", "GROUP", "SECTION"];
  const DOCUMENT_TYPES = ["DOCUMENT", "PAGE"];

  // Build list of element with their types
  const getStructureCall = tools.createToolCall(
    "get_page_structure",
    randomUUID(),
    {}
  );
  const res = await tools.callTool(getStructureCall);
  if (res.isError || !res.structuredContent?.structureTree) {
    throw new Error(`Failed to switch parent ID: ${res.error}`);
  }
  if (!res.structuredContent?.structureTree) {
    throw new Error(
      "Failed to switch parent ID: No structure tree found in the response"
    );
  }

  const elementTree = res.structuredContent.structureTree as Array<object>;
  const elementTypes = new Map<string, string>();
  for (const node of elementTree) {
    traverseTree(node, elementTypes);
  }

  for (const toolCall of callToolRequests) {
    if (!toolCall.arguments) continue;
    const toolArguments = toolCall.arguments;

    const hasParentIdArg = tools.catalogue
      .get(toolCall.name)
      ?.inputSchema.properties!.hasOwnProperty("parentId");

    // Parent ID Validation
    if (hasParentIdArg && toolArguments.parentId) {
      const parentId = toolArguments.parentId as string;
      const parentType = elementTypes.get(parentId);
      let warning: string | null = null;

      if (!parentType) {
        warning = `parentId ${parentId} does not exist in the structure tree.`;
      } else if (!CORRECT_PARENT_TYPES.includes(parentType)) {
        warning = `parentId ${parentId} has invalid type: ${parentType}.`;
      } else if (DOCUMENT_TYPES.includes(parentType) || parentId === "0:1") {
        warning = `parentId ${parentId} is of forbidden type ${parentType}.`;
      }

      // Parent ID Modification
      if (warning) {
        console.warn(`Tool call ${toolCall.name}: ${warning}`);
        toolCall.arguments!.parentId = mainScreenFrameId;
        continue;
      }
    }

    // Parent ID Insertion
    if (hasParentIdArg && !toolArguments.parentId) {
      toolArguments["parentId"] = mainScreenFrameId;
    }
  }

  return callToolRequests;
};
