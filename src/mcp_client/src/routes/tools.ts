import { Request, Response } from "express";
import {
  callTool,
  createToolCall,
  getRootFrameInfo,
  setRootFrameInfo,
} from "../core/agent";
import { randomUUID } from "crypto";
import { ResponseData, ResponseStatus, ToolResponseFormat } from "../types";

export const getSelection = async (
  req: Request,
  res: Response<ResponseData>
): Promise<void> => {
  try {
    const toolCall = createToolCall("get_selection", randomUUID());
    const result = await callTool(toolCall);
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
      payload: {
        selection,
      },
    });
  } catch (error) {
    console.error("Error in getSelection:", error);
    res
      .status(500)
      .json({ status: ResponseStatus.ERROR, message: String(error) });
  }
};

export const createRootFrame = async (
  req: Request,
  res: Response<ResponseData>
): Promise<void> => {
  try {
    const x = Number(req.query.x) || 0;
    const y = Number(req.query.y) || 0;
    const width = Number(req.query.width) || 0;
    const height = Number(req.query.height) || 0;
    const name = (req.query.name as string) || "Frame";

    if (!width || !height) {
      res.status(400).json({
        status: ResponseStatus.ERROR,
        message: "Width and height are required",
      });
      return;
    }
    const toolCall = createToolCall("create_frame", randomUUID(), {
      x,
      y,
      width,
      height,
      name,
      fillColor: { r: 1, g: 1, b: 1, a: 1 },
    });

    const result = await callTool(toolCall);

    if (result.isError === false && result.content) {
      const response = result.content.find(
        (message) => message.type === ToolResponseFormat.TEXT
      );
      const rootFrameId = result.structuredContent?.id as string;

      if (!response || !response.text || !rootFrameId) {
        res.json({
          status: ResponseStatus.ERROR,
          message: "No frame ID found in tool response",
        });
        return;
      }

      setRootFrameInfo(rootFrameId, width, height);
      res.json({
        status: ResponseStatus.SUCCESS,
        message: response.text,
        payload: {
          root_frame_id: rootFrameId,
          width,
          height,
        },
      });
    }
  } catch (error) {
    console.error("Error in createRootFrame:", error);
    res
      .status(500)
      .json({ status: ResponseStatus.ERROR, message: String(error) });
  }
};

export const createTextInRootFrame = async (
  req: Request,
  res: Response<ResponseData>
): Promise<void> => {
  try {
    const rootFrameInfo = getRootFrameInfo();
    if (!rootFrameInfo.id) {
      res.status(400).json({
        status: ResponseStatus.ERROR,
        message:
          "No root_frame_id set. Please call /tool/create_root_frame first.",
      });
      return;
    }
    const toolCall = createToolCall("create_text", randomUUID(), {
      parentId: rootFrameInfo.id,
      x: 100,
      y: 100,
      text: "Hello in root!",
    });
    const result = await callTool(toolCall);
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
    res
      .status(500)
      .json({ status: ResponseStatus.ERROR, message: String(error) });
  }
};

export const deleteNode = async (
  req: Request,
  res: Response<ResponseData>
): Promise<void> => {
  try {
    const { node_id } = req.body;

    if (!node_id) {
      res
        .status(400)
        .json({ status: ResponseStatus.ERROR, message: "node_id is required" });
      return;
    }

    const toolCall = createToolCall("delete_node", randomUUID(), {
      nodeId: node_id,
    });
    const result = await callTool(toolCall);
    res.json({
      status: ResponseStatus.SUCCESS,
      message: `Node with ID ${node_id} deleted successfully`,
      payload: {
        nodeInfo: result.structuredContent,
      },
    });
  } catch (error) {
    console.error("Error in deleteNode:", error);
    res
      .status(500)
      .json({ status: ResponseStatus.ERROR, message: String(error) });
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
    const toolCall = createToolCall("delete_multiple_nodes", randomUUID(), {
      nodeIds: node_ids,
    });
    const result = await callTool(toolCall);
    const typedResult = result.structuredContent as {
      deleted: string[];
      errors: string[] | undefined;
      summary: {
        total: number;
        deleted: number;
        errors: number;
      };
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
    res
      .status(500)
      .json({ status: ResponseStatus.ERROR, message: String(error) });
  }
};

export const deleteAllTopLevelNodes = async (
  req: Request,
  res: Response<ResponseData>
): Promise<void> => {
  try {
    const documentInfoToolCall = createToolCall(
      "get_document_info",
      randomUUID()
    );
    const response = await callTool(documentInfoToolCall);

    if (response.status !== "success") {
      res.status(500).json({
        status: ResponseStatus.ERROR,
        message: "Failed to get document info",
      });
      return;
    }

    const documentInfoResponse = response.content.find(
      (msg) => msg.type === "text"
    )?.text;
    let documentInfo;
    if (!documentInfoResponse) {
      res.status(500).json({
        status: ResponseStatus.ERROR,
        message: "No document info found",
      });
      return;
    }
    try {
      documentInfo = JSON.parse(documentInfoResponse);
    } catch (parseError) {
      res.status(500).json({
        status: ResponseStatus.ERROR,
        message: "Failed to parse document info",
      });
      return;
    }

    if (!documentInfo.children) {
      res.json({
        status: ResponseStatus.SUCCESS,
        message: "No children in document.",
      });
      return;
    }

    const topNodeIds = documentInfo.children.map((node: any) => node.id);

    if (topNodeIds.length === 0) {
      res.json({
        status: ResponseStatus.SUCCESS,
        message: "No nodes to delete.",
      });
      return;
    }
    const deleteNodesToolCall = createToolCall(
      "delete_multiple_nodes",
      randomUUID(),
      {
        nodeIds: topNodeIds,
      }
    );
    const result = await callTool(deleteNodesToolCall);
    res.json({
      status: ResponseStatus.SUCCESS,
      payload: {
        deleted_node_ids: topNodeIds,
        result: result,
      },
    });
  } catch (error) {
    console.error("Error in deleteAllTopLevelNodes:", error);
    res
      .status(500)
      .json({ status: ResponseStatus.ERROR, message: String(error) });
  }
};

export const getChannels = async (
  req: Request,
  res: Response<ResponseData>
): Promise<void> => {
  try {
    const getChannelsToolCall = createToolCall("get_channels", randomUUID());
    const result = await callTool(getChannelsToolCall);

    if (result.isError === false && result.content) {
      try {
        const channelList =
          (result.structuredContent?.availableChannels as Array<string>) || [];
        const currentChannel = result.structuredContent?.currentChannel || null;

        // Check if channelList exists and is an array
        if (!Array.isArray(channelList) || channelList.length === 0) {
          res.json({
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
      } catch (parseError) {
        res.json({
          status: ResponseStatus.ERROR,
          message: "Failed to parse channel information",
        });
      }
    } else {
      res.json({
        status: ResponseStatus.ERROR,
        message: "Invalid response from tool",
      });
    }
  } catch (error) {
    console.error("Error in getChannels:", error);
    res
      .status(500)
      .json({ status: ResponseStatus.ERROR, message: String(error) });
  }
};

export const selectChannel = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const channel = (req.query.channel as string) || req.body.channel;

    if (!channel) {
      res.status(400).json({ error: "channel is required" });
      return;
    }

    const toolCall = createToolCall("select_channel", randomUUID(), {
      channel,
    });
    const result = await callTool(toolCall);

    if (result.isError === false && result.structuredContent?.channel) {
      res.json({
        status: "success",
        message: `Switched to channel: ${result.structuredContent.channel}`,
      });
    } else {
      res.json({ status: "error", message: "Invalid response from tool" });
    }
  } catch (error) {
    console.error("Error in selectChannel:", error);
    res.status(500).json({ error: String(error) });
  }
};
