import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { ResponseData, ResponseStatus } from "../types";
import { globalSession } from "../core/session";
import { clearPage, isPageClear, getPageImage, logger } from "../utils/helpers";

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
      "get_selection_info",
      randomUUID()
    );
    const result = await globalSession.state.tools!.callTool(toolCall);
    const selection = result.structuredContent?.nodeList;

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
    logger.error({
      header: "Error in getSelection",
      body: error instanceof Error ? error.message : String(error),
    });
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

    const cleared_ids = clearPage(globalSession.state.tools!);

    res.json({
      status: ResponseStatus.SUCCESS,
      message: "All top-level nodes deleted successfully",
      payload: {
        deleted_node_ids: cleared_ids,
      },
    });

    return;
  } catch (error) {
    logger.error({
      header: "Error in deleteAllTopLevelNodes",
      body: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      status: ResponseStatus.ERROR,
      message: String(error),
    });
  }
};

export const retrievePageStatus = async (
  req: Request,
  res: Response<ResponseData>
): Promise<void> => {
  try {
    if (!validateTools(res)) return;

    const pageClear = await isPageClear(globalSession.state.tools!);

    if (pageClear) {
      res.json({
        status: ResponseStatus.SUCCESS,
        payload: { is_empty: true },
      });
    } else {
      res.json({
        status: ResponseStatus.SUCCESS,
        payload: { is_empty: false },
      });
    }
  } catch (error) {
    logger.error({
      header: "Error in retrievePageStatus",
      body: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      status: ResponseStatus.ERROR,
      message: String(error),
    });
  }
};

export const retrievePageImage = async (
  req: Request,
  res: Response<ResponseData>
): Promise<void> => {
  try {
    if (!validateTools(res)) return;
    const imageURI = await getPageImage(globalSession.state.tools!);

    if (!imageURI) {
      res.status(404).json({
        status: ResponseStatus.ERROR,
        message: "No image data found",
      });
      return;
    }

    res.json({
      status: ResponseStatus.SUCCESS,
      payload: { image_uri: imageURI },
    });
  } catch (error) {
    logger.error({
      header: "Error in retrievePageImage",
      body: error instanceof Error ? error.message : String(error),
    });
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
    logger.error({
      header: "Error in getChannels",
      body: error instanceof Error ? error.message : String(error),
    });
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
    logger.error({
      header: "Error in selectChannel",
      body: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      status: ResponseStatus.ERROR,
      message: String(error),
    });
  }
};
