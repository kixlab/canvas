import { Request, Response } from "express";
import { callTool, getRootFrameInfo, setRootFrameInfo } from "../core/agent";

export const getSelection = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const result = await callTool("get_selection");
    res.json(result);
  } catch (error) {
    console.error("Error in getSelection:", error);
    res.status(500).json({ error: String(error) });
  }
};

export const createRootFrame = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const x = Number(req.query.x) || 0;
    const y = Number(req.query.y) || 0;
    const width = Number(req.query.width) || 0;
    const height = Number(req.query.height) || 0;
    const name = (req.query.name as string) || "Frame";

    if (!width || !height) {
      res.status(400).json({ error: "Width and height are required" });
      return;
    }

    const result = await callTool("create_frame", {
      x,
      y,
      width,
      height,
      name,
      fillColor: { r: 1, g: 1, b: 1, a: 1 },
    });

    const IdRegex = /ID:\s*(\d+:\d+)/;

    let rootFrameId = null;
    if (result.status === "success" && result.content) {
      const response = result.content.find((msg: any) => msg.type === "text");
      if (!response || !response.text) {
        res.json({
          status: "error",
          message: "No frame ID found in tool response",
        });
        return;
      }
      const idMatch = response.text.match(IdRegex);

      if (idMatch) {
        rootFrameId = idMatch[1];
        setRootFrameInfo(rootFrameId, width, height);
        res.json({
          response: response,
          root_frame_id: rootFrameId,
          width,
          height,
        });
      } else {
        res.json({
          status: "error",
          message: "No frame ID found in tool response",
        });
        return;
      }
    }
  } catch (error) {
    console.error("Error in createRootFrame:", error);
    res.status(500).json({ error: String(error) });
  }
};

export const createTextInRootFrame = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const rootFrameInfo = getRootFrameInfo();
    if (!rootFrameInfo.id) {
      res.status(400).json({
        status: "error",
        message:
          "No root_frame_id set. Please call /tool/create_root_frame first.",
      });
      return;
    }

    const result = await callTool("create_text", {
      parentId: rootFrameInfo.id,
      x: 100,
      y: 100,
      text: "Hello in root!",
    });

    res.json(result);
  } catch (error) {
    console.error("Error in createTextInRootFrame:", error);
    res.status(500).json({ error: String(error) });
  }
};

export const deleteNode = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { node_id } = req.body;

    if (!node_id) {
      res.status(400).json({ error: "node_id is required" });
      return;
    }

    const result = await callTool("delete_node", { nodeId: node_id });
    res.json(result);
  } catch (error) {
    console.error("Error in deleteNode:", error);
    res.status(500).json({ error: String(error) });
  }
};

export const deleteMultipleNodes = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { node_ids } = req.body;

    if (!Array.isArray(node_ids)) {
      res.status(400).json({ error: "node_ids must be an array" });
      return;
    }

    const result = await callTool("delete_multiple_nodes", {
      nodeIds: node_ids,
    });
    res.json(result);
  } catch (error) {
    console.error("Error in deleteMultipleNodes:", error);
    res.status(500).json({ error: String(error) });
  }
};

export const deleteAllTopLevelNodes = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const response = await callTool("get_document_info");

    if (response.status !== "success") {
      res.status(500).json({ error: "Failed to get document info" });
      return;
    }

    const documentInfoResponse = response.content.find(
      (msg: any) => msg.type === "text"
    )?.text;
    let documentInfo;
    if (!documentInfoResponse) {
      res.status(500).json({ error: "No document info found" });
      return;
    }
    try {
      documentInfo = JSON.parse(documentInfoResponse);
    } catch (parseError) {
      res.status(500).json({ error: "Failed to parse document info" });
      return;
    }

    if (!documentInfo.children) {
      res.json({ status: "success", message: "No children in document." });
      return;
    }

    const topNodeIds = documentInfo.children.map((node: any) => node.id);

    if (topNodeIds.length === 0) {
      res.json({ status: "success", message: "No nodes to delete." });
      return;
    }

    const result = await callTool("delete_multiple_nodes", {
      nodeIds: topNodeIds,
    });
    res.json({
      status: "success",
      deleted_node_ids: topNodeIds,
      result: result,
    });
  } catch (error) {
    console.error("Error in deleteAllTopLevelNodes:", error);
    res.status(500).json({ error: String(error) });
  }
};

export const getChannels = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const result = await callTool("get_channels");

    if (result.status === "success" && result.content) {
      try {
        const response = result.content.find((msg: any) => msg.type === "text");
        if (!response || !response.text) {
          res.json({
            status: "error",
            message: "No channel information found",
          });
          return;
        }
        const channelData = JSON.parse(response["text"]);
        console.log(channelData);
        res.json({
          status: "success",
          available_channels: channelData.availableChannels || [],
          current_channel: channelData.currentChannel,
        });
      } catch (parseError) {
        res.json({
          status: "error",
          message: "Failed to parse channel information",
        });
      }
    } else {
      res.json({ status: "error", message: "Invalid response from tool" });
    }
  } catch (error) {
    console.error("Error in getChannels:", error);
    res.status(500).json({ error: String(error) });
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

    const result = await callTool("select_channel", { channel });

    if (result.status === "success" && result.content) {
      const message = result.content.find(
        (msg: any) => msg.type === "text"
      )?.text;
      if (!message) {
        res.json({
          status: "error",
          message: "No text message found in tool response",
        });
        return;
      }
    } else {
      res.json({ status: "error", message: "Invalid response from tool" });
    }
  } catch (error) {
    console.error("Error in selectChannel:", error);
    res.status(500).json({ error: String(error) });
  }
};
