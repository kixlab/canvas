import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { ResponseData, ToolResponseFormat, ResponseStatus } from "../types";
import { globalSession } from "../core/session";
import { TextContent } from "@modelcontextprotocol/sdk/types";

// Helper function for common validation
const validateTools = (res: Response<ResponseData>) => {
  if (!globalSession.state.tools) {
    res.status(400).json({
      status: ResponseStatus.ERROR,
      message: "Tools are not initialized in the session",
    });
    return false;
  }
  return true;
};

export const getSelection = async (
  req: Request,
  res: Response<ResponseData>
): Promise<void> => {
  try {
    if (!validateTools(res)) return;

    const toolCall = globalSession.state.tools!.createToolCall(
      "get_selection",
      randomUUID()
    );
    const result = await globalSession.state.tools!.callTool(toolCall);
    const selection = result.structuredContent?.selection;

    if (!selection) {
      res.status(404).json({
        status: ResponseStatus.ERROR,
        message: "No selection found",
      });
      return;
    }

    res.json({
      status: ResponseStatus.SUCCESS,
      payload: { selection },
    });
  } catch (error) {
    console.error("Error in getSelection:", error);
    res.status(500).json({
      status: ResponseStatus.ERROR,
      message: String(error),
    });
  }
};

export const createRootFrame = async (
  req: Request,
  res: Response<ResponseData>
): Promise<void> => {
  try {
    const { x = 0, y = 0, width = 0, height = 0, name = "Frame" } = req.query;

    if (!width || !height) {
      res.status(400).json({
        status: ResponseStatus.ERROR,
        message: "Width and height are required",
      });
      return;
    }

    if (!validateTools(res)) return;

    const toolCall = globalSession.state.tools!.createToolCall(
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

    const result = await globalSession.state.tools!.callTool(toolCall);

    if (result.isError || !result.content) {
      res.status(500).json({
        status: ResponseStatus.ERROR,
        message: "Failed to create frame",
      });
      return;
    }

    const response = result.content.find(
      (msg: any) => msg.type === ToolResponseFormat.TEXT
    ) as TextContent;
    const rootFrameId = result.structuredContent?.id as string;

    if (!response?.text || !rootFrameId) {
      res.status(500).json({
        status: ResponseStatus.ERROR,
        message: "No frame ID found in tool response",
      });
      return;
    }

    globalSession.setRootFrame(rootFrameId, Number(width), Number(height));

    res.json({
      status: ResponseStatus.SUCCESS,
      message: response.text,
      payload: {
        root_frame_id: rootFrameId,
        width: Number(width),
        height: Number(height),
      },
    });
  } catch (error) {
    console.error("Error in createRootFrame:", error);
    res.status(500).json({
      status: ResponseStatus.ERROR,
      message: String(error),
    });
  }
};

export const createTextInRootFrame = async (
  req: Request,
  res: Response<ResponseData>
): Promise<void> => {
  try {
    const rootFrameInfo = globalSession.state.rootFrame;

    if (!rootFrameInfo.id) {
      res.status(400).json({
        status: ResponseStatus.ERROR,
        message:
          "No root_frame_id set. Please call /tool/create_root_frame first.",
      });
      return;
    }

    if (!validateTools(res)) return;

    const toolCall = globalSession.state.tools!.createToolCall(
      "create_text",
      randomUUID(),
      {
        parentId: rootFrameInfo.id,
        x: 100,
        y: 100,
        text: "Hello in root!",
      }
    );

    const result = await globalSession.state.tools!.callTool(toolCall);

    res.json({
      status: ResponseStatus.SUCCESS,
      message: "Text created in root frame",
      payload: {
        frameId: rootFrameInfo.id,
        textId: result.structuredContent?.id,
      },
    });
  } catch (error) {
    console.error("Error in createTextInRootFrame:", error);
    res.status(500).json({
      status: ResponseStatus.ERROR,
      message: String(error),
    });
  }
};

export const deleteNode = async (
  req: Request,
  res: Response<ResponseData>
): Promise<void> => {
  try {
    const { node_id } = req.body;

    if (!node_id) {
      res.status(400).json({
        status: ResponseStatus.ERROR,
        message: "node_id is required",
      });
      return;
    }

    if (!validateTools(res)) return;

    const toolCall = globalSession.state.tools!.createToolCall(
      "delete_node",
      randomUUID(),
      {
        nodeId: node_id,
      }
    );
    const result = await globalSession.state.tools!.callTool(toolCall);

    res.json({
      status: ResponseStatus.SUCCESS,
      message: `Node with ID ${node_id} deleted successfully`,
      payload: { nodeInfo: result.structuredContent },
    });
  } catch (error) {
    console.error("Error in deleteNode:", error);
    res.status(500).json({
      status: ResponseStatus.ERROR,
      message: String(error),
    });
  }
};

export const deleteMultipleNodes = async (
  req: Request,
  res: Response<ResponseData>
): Promise<void> => {
  try {
    const { node_ids } = req.body;

    if (!Array.isArray(node_ids)) {
      res.status(400).json({
        status: ResponseStatus.ERROR,
        message: "node_ids must be an array",
      });
      return;
    }

    if (!validateTools(res)) return;

    const toolCall = globalSession.state.tools!.createToolCall(
      "delete_multiple_nodes",
      randomUUID(),
      {
        nodeIds: node_ids,
      }
    );

    const result = await globalSession.state.tools!.callTool(toolCall);
    const typedResult = result.structuredContent as {
      deleted: string[];
      errors: string[] | undefined;
      summary: { total: number; deleted: number; errors: number };
    };

    res.json({
      status: ResponseStatus.SUCCESS,
      message: `Deleted ${typedResult.summary.deleted} nodes successfully`,
      payload: {
        deleted_node_ids: typedResult.deleted,
        errors: typedResult.errors || [],
        summary: typedResult.summary,
      },
    });
  } catch (error) {
    console.error("Error in deleteMultipleNodes:", error);
    res.status(500).json({
      status: ResponseStatus.ERROR,
      message: String(error),
    });
  }
};

export const deleteAllTopLevelNodes = async (
  req: Request,
  res: Response<ResponseData>
): Promise<void> => {
  try {
    if (!validateTools(res)) return;

    // Get document info
    const documentInfoToolCall = globalSession.state.tools!.createToolCall(
      "get_document_info",
      randomUUID()
    );
    const response = await globalSession.state.tools!.callTool(
      documentInfoToolCall
    );

    if (response.isError) {
      res.status(500).json({
        status: ResponseStatus.ERROR,
        message: "Failed to get document info",
      });
      return;
    }

    const documentInfoResponse = response.content.find(
      (msg: any) => msg.type === "text"
    )?.text as string;
    if (!documentInfoResponse) {
      res.status(500).json({
        status: ResponseStatus.ERROR,
        message: "No document info found",
      });
      return;
    }

    let documentInfo;
    try {
      documentInfo = JSON.parse(documentInfoResponse);
    } catch {
      res.status(500).json({
        status: ResponseStatus.ERROR,
        message: "Failed to parse document info",
      });
      return;
    }

    if (!documentInfo.children?.length) {
      res.json({
        status: ResponseStatus.SUCCESS,
        message: "No nodes to delete",
      });
      return;
    }

    const topNodeIds = documentInfo.children.map((node: any) => node.id);
    const deleteNodesToolCall = globalSession.state.tools!.createToolCall(
      "delete_multiple_nodes",
      randomUUID(),
      {
        nodeIds: topNodeIds,
      }
    );

    const result = await globalSession.state.tools!.callTool(
      deleteNodesToolCall
    );

    res.json({
      status: ResponseStatus.SUCCESS,
      payload: {
        deleted_node_ids: topNodeIds,
        result: result,
      },
    });
  } catch (error) {
    console.error("Error in deleteAllTopLevelNodes:", error);
    res.status(500).json({
      status: ResponseStatus.ERROR,
      message: String(error),
    });
  }
};

export const getChannels = async (
  req: Request,
  res: Response<ResponseData>
): Promise<void> => {
  try {
    if (!validateTools(res)) return;

    const getChannelsToolCall = globalSession.state.tools!.createToolCall(
      "get_channels",
      randomUUID()
    );
    const result = await globalSession.state.tools!.callTool(
      getChannelsToolCall
    );

    if (result.isError || !result.content) {
      res.status(500).json({
        status: ResponseStatus.ERROR,
        message: "Invalid response from tool",
      });
      return;
    }

    const channelList =
      (result.structuredContent?.availableChannels as Array<string>) || [];
    const currentChannel = result.structuredContent?.currentChannel || null;

    if (!Array.isArray(channelList) || channelList.length === 0) {
      res.status(500).json({
        status: ResponseStatus.ERROR,
        message: "No channel information found",
      });
      return;
    }

    res.json({
      status: ResponseStatus.SUCCESS,
      payload: {
        available_channels: channelList,
        current_channel: currentChannel,
      },
    });
  } catch (error) {
    console.error("Error in getChannels:", error);
    res.status(500).json({
      status: ResponseStatus.ERROR,
      message: String(error),
    });
  }
};

export const selectChannel = async (
  req: Request,
  res: Response<ResponseData>
): Promise<void> => {
  try {
    const channel = (req.query.channel as string) || req.body.channel;

    if (!channel) {
      res.status(400).json({
        status: ResponseStatus.ERROR,
        message: "channel is required",
      });
      return;
    }

    if (!validateTools(res)) return;

    const toolCall = globalSession.state.tools!.createToolCall(
      "select_channel",
      randomUUID(),
      { channel }
    );
    const result = await globalSession.state.tools!.callTool(toolCall);

    if (result.isError || !result.structuredContent?.channel) {
      res.status(500).json({
        status: ResponseStatus.ERROR,
        message: "Invalid response from tool",
      });
      return;
    }

    res.json({
      status: ResponseStatus.SUCCESS,
      message: `Switched to channel: ${result.structuredContent.channel}`,
    });
  } catch (error) {
    console.error("Error in selectChannel:", error);
    res.status(500).json({
      status: ResponseStatus.ERROR,
      message: String(error),
    });
  }
};
