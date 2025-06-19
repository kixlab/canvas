import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { ResponseData, ToolResponseFormat } from "../types";
import {
  ResponseFormatter,
  withErrorHandling,
} from "../utils/response-formatter";
import { globalSession } from "../core/session";

export const getSelection = withErrorHandling(
  async (req: Request, res: Response<ResponseData>) => {
    if (!globalSession.state.tools) {
      return ResponseFormatter.badRequest(
        res,
        "Tools are not initialized in the session"
      );
    }

    const toolCall = globalSession.state.tools.createToolCall(
      "get_selection",
      randomUUID()
    );
    const result = await globalSession.state.tools.callTool(toolCall);
    const selection = result.structuredContent?.selection;

    if (!selection) {
      return ResponseFormatter.notFound(res, "No selection found");
    }

    ResponseFormatter.success(res, undefined, { selection });
  }
);

export const createRootFrame = withErrorHandling(
  async (req: Request, res: Response<ResponseData>) => {
    const { x = 0, y = 0, width = 0, height = 0, name = "Frame" } = req.query;

    if (!width || !height) {
      return ResponseFormatter.badRequest(res, "Width and height are required");
    }

    if (!globalSession.state.tools) {
      return ResponseFormatter.badRequest(
        res,
        "Tools are not initialized in the session"
      );
    }

    const toolCall = globalSession.state.tools.createToolCall(
      "create_frame",
      randomUUID(),
      {
        x: Number(x),
        y: Number(y),
        width: Number(width),
        height: Number(height),
        name: String(name),
        fillColor: { r: 1, g: 1, b: 1, a: 1 },
      }
    );

    const result = await globalSession.state.tools.callTool(toolCall);

    if (result.isError || !result.content) {
      return ResponseFormatter.error(res, "Failed to create frame");
    }

    const response = result.content.find(
      (msg: any) => msg.type === ToolResponseFormat.TEXT
    );
    const rootFrameId = result.structuredContent?.id as string;

    if (!response?.text || !rootFrameId) {
      return ResponseFormatter.error(res, "No frame ID found in tool response");
    }

    globalSession.setRootFrame(rootFrameId, Number(width), Number(height));

    ResponseFormatter.success(res, (response as any).text, {
      root_frame_id: rootFrameId,
      width: Number(width),
      height: Number(height),
    });
  }
);

export const createTextInRootFrame = withErrorHandling(
  async (req: Request, res: Response<ResponseData>) => {
    const rootFrameInfo = globalSession.state.rootFrame;

    if (!rootFrameInfo.id) {
      return ResponseFormatter.badRequest(
        res,
        "No root_frame_id set. Please call /tool/create_root_frame first."
      );
    }

    if (!globalSession.state.tools) {
      return ResponseFormatter.badRequest(
        res,
        "Tools are not initialized in the session"
      );
    }

    const toolCall = globalSession.state.tools.createToolCall(
      "create_text",
      randomUUID(),
      {
        parentId: rootFrameInfo.id,
        x: 100,
        y: 100,
        text: "Hello in root!",
      }
    );

    const result = await globalSession.state.tools.callTool(toolCall);

    ResponseFormatter.success(res, "Text created in root frame", {
      frameId: rootFrameInfo.id,
      textId: result.structuredContent?.id,
    });
  }
);

export const deleteNode = withErrorHandling(
  async (req: Request, res: Response<ResponseData>) => {
    const { node_id } = req.body;

    if (!node_id) {
      return ResponseFormatter.badRequest(res, "node_id is required");
    }

    if (!globalSession.state.tools) {
      return ResponseFormatter.badRequest(
        res,
        "Tools are not initialized in the session"
      );
    }

    const toolCall = globalSession.state.tools.createToolCall(
      "delete_node",
      randomUUID(),
      {
        nodeId: node_id,
      }
    );
    const result = await globalSession.state.tools.callTool(toolCall);

    ResponseFormatter.success(
      res,
      `Node with ID ${node_id} deleted successfully`,
      {
        nodeInfo: result.structuredContent,
      }
    );
  }
);

export const deleteMultipleNodes = withErrorHandling(
  async (req: Request, res: Response<ResponseData>) => {
    const { node_ids } = req.body;

    if (!Array.isArray(node_ids)) {
      return ResponseFormatter.badRequest(res, "node_ids must be an array");
    }

    if (!globalSession.state.tools) {
      return ResponseFormatter.badRequest(
        res,
        "Tools are not initialized in the session"
      );
    }

    const toolCall = globalSession.state.tools.createToolCall(
      "delete_multiple_nodes",
      randomUUID(),
      {
        nodeIds: node_ids,
      }
    );

    const result = await globalSession.state.tools.callTool(toolCall);
    const typedResult = result.structuredContent as {
      deleted: string[];
      errors: string[] | undefined;
      summary: { total: number; deleted: number; errors: number };
    };

    ResponseFormatter.success(
      res,
      `Deleted ${typedResult.summary.deleted} nodes successfully`,
      {
        deleted_node_ids: typedResult.deleted,
        errors: typedResult.errors || [],
        summary: typedResult.summary,
      }
    );
  }
);

export const deleteAllTopLevelNodes = withErrorHandling(
  async (req: Request, res: Response<ResponseData>) => {
    if (!globalSession.state.tools) {
      return ResponseFormatter.badRequest(
        res,
        "Tools are not initialized in the session"
      );
    }
    // Get document info
    const documentInfoToolCall = globalSession.state.tools.createToolCall(
      "get_document_info",
      randomUUID()
    );
    const response = await globalSession.state.tools.callTool(
      documentInfoToolCall
    );

    if (response.isError) {
      return ResponseFormatter.error(res, "Failed to get document info");
    }

    const documentInfoResponse = response.content.find(
      (msg: any) => msg.type === "text"
    )?.text as string;
    if (!documentInfoResponse) {
      return ResponseFormatter.error(res, "No document info found");
    }

    let documentInfo;
    try {
      documentInfo = JSON.parse(documentInfoResponse);
    } catch {
      return ResponseFormatter.error(res, "Failed to parse document info");
    }

    if (!documentInfo.children?.length) {
      return ResponseFormatter.success(res, "No nodes to delete");
    }

    const topNodeIds = documentInfo.children.map((node: any) => node.id);
    const deleteNodesToolCall = globalSession.state.tools.createToolCall(
      "delete_multiple_nodes",
      randomUUID(),
      {
        nodeIds: topNodeIds,
      }
    );

    const result = await globalSession.state.tools.callTool(
      deleteNodesToolCall
    );

    ResponseFormatter.success(res, undefined, {
      deleted_node_ids: topNodeIds,
      result: result,
    });
  }
);

export const getChannels = withErrorHandling(
  async (req: Request, res: Response<ResponseData>) => {
    if (!globalSession.state.tools) {
      return ResponseFormatter.badRequest(
        res,
        "Tools are not initialized in the session"
      );
    }
    const getChannelsToolCall = globalSession.state.tools.createToolCall(
      "get_channels",
      randomUUID()
    );
    const result = await globalSession.state.tools.callTool(
      getChannelsToolCall
    );

    if (result.isError || !result.content) {
      return ResponseFormatter.error(res, "Invalid response from tool");
    }

    const channelList =
      (result.structuredContent?.availableChannels as Array<string>) || [];
    const currentChannel = result.structuredContent?.currentChannel || null;

    if (!Array.isArray(channelList) || channelList.length === 0) {
      return ResponseFormatter.error(res, "No channel information found");
    }

    ResponseFormatter.success(res, undefined, {
      available_channels: channelList,
      current_channel: currentChannel,
    });
  }
);

export const selectChannel = withErrorHandling(
  async (req: Request, res: Response) => {
    const channel = (req.query.channel as string) || req.body.channel;

    if (!channel) {
      return ResponseFormatter.badRequest(res, "channel is required");
    }
    if (!globalSession.state.tools) {
      return ResponseFormatter.badRequest(
        res,
        "Tools are not initialized in the session"
      );
    }

    const toolCall = globalSession.state.tools.createToolCall(
      "select_channel",
      randomUUID(),
      { channel }
    );
    const result = await globalSession.state.tools.callTool(toolCall);

    if (result.isError || !result.structuredContent?.channel) {
      return ResponseFormatter.error(res, "Invalid response from tool");
    }

    ResponseFormatter.success(
      res,
      `Switched to channel: ${result.structuredContent.channel}`
    );
  }
);
