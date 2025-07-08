// feedbackAgent.ts – two-stage Improvement / Feedback agent
// Refer to https://arxiv.org/pdf/2410.16232
import { randomUUID } from "crypto";
import {
  UserRequestMessage,
  GenericMessage,
  AgentMetadata,
  RoleType,
  MessageType,
  ContentType,
  ToolResponseMessage,
} from "../types";
import { ModelInstance } from "../models/baseModel";
import { Tools } from "../core/tools";
import { AgentInstance } from "./baseAgent";
import {
  AudioContent,
  CallToolResult,
  EmbeddedResource,
  ImageContent,
  TextContent,
} from "@modelcontextprotocol/sdk/types";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { getUpdateInstruction, getFeedbackPrompt } from "../utils/prompts";
import {
  switchParentId,
  intializeMainScreenFrame,
  isPageClear,
  clearPage,
  getPageImage,
  getPageStructure,
} from "../utils/helpers";

const DEFAULT_MAX_RETRIES = 3;

export class FeedbackAgent extends AgentInstance {
  async run(params: {
    requestMessage: UserRequestMessage;
    tools: Tools;
    model: ModelInstance;
    metadata: AgentMetadata;
  }): Promise<{
    case_id: string;
    history: GenericMessage[];
    responses: any[];
    cost: number;
    json_structure: Object;
    image_base64: string;
  }> {
    // Step 0: Check page
    const pageStatus = await isPageClear(params.tools);
    if (!pageStatus) {
      console.log("Page is not clear. Clearing the page...");
      await clearPage(params.tools);
    }

    // Step 1: Initialize parameters
    const originalTargetText = this.extractTextFromContent(
      params.requestMessage.content
    );
    const originalTargetImage = this.extractImageFromContent(
      params.requestMessage.content
    );
    let currentRequestMessage: UserRequestMessage = params.requestMessage;

    // Step 2: Prepare message contexts
    const overallHistory: GenericMessage[] = [];
    const overallRawResponses: any[] = [];

    // Step 3: Create an environment
    let totalCost = 0;
    const {
      mainScreenFrameId,
      width: frameWidth,
      height: frameHeight,
    } = await intializeMainScreenFrame(params.requestMessage, params.tools);

    /* --- Feedback Loop --------------------------------- */
    for (
      let iteration = 0;
      iteration < (this.maxRetries ?? DEFAULT_MAX_RETRIES);
      iteration++
    ) {
      // (1) Run design
      const designResult = await this.runDesignPhase({
        requestMessage: currentRequestMessage,
        tools: params.tools,
        model: params.model,
        maxDesignTurns: this.maxTurns,
        mainScreenFrameId: mainScreenFrameId,
      });

      console.log(
        `[FeedbackAgent] A design completed - turn ${iteration} | cost: ${totalCost}`
      );

      overallHistory.push(...designResult.history);
      overallRawResponses.push(...designResult.responses);
      totalCost += designResult.cost / 1000; // Convert to USD

      // (2) Get UI Snapshot
      const { labeledImageContent: currentStatusImage, pageStructureText } =
        await this.getCurrentDesignSnapshot(params.tools, params.model);

      // (3) Feedback Phase
      const feedbackResult = await this.runFeedbackPhase({
        originalTargetText: originalTargetText ?? undefined,
        originalTargetImage: originalTargetImage ?? undefined,
        currentImage: currentStatusImage,
        pageStructureText,
        model: params.model,
      });

      overallHistory.push(...feedbackResult.history);
      overallRawResponses.push(feedbackResult.rawResponse);
      totalCost += feedbackResult.cost / 1000; // Convert to USD
      const feedbackInstruction = feedbackResult.instructionText.trim();

      console.log(
        `[FeedbackAgent] A feedback completed - turn ${iteration}: ${feedbackInstruction} | cost: ${totalCost}`
      );

      // (4) Prepare for next iteration
      currentRequestMessage = this.buildFeedbackRequestMessage({
        feedbackInstruction: feedbackInstruction,
        statusImageContent: currentStatusImage,
        originalTargetImage: originalTargetImage ?? undefined,
        pageStructureText: pageStructureText ?? undefined,
        frameWidth,
        frameHeight,
      });
    }

    // Get page structure and image
    const pageStructure = await getPageStructure(params.tools);
    const resultImage = await getPageImage(params.tools);
    await clearPage(params.tools);

    return {
      case_id: params.metadata.caseId,
      history: overallHistory,
      responses: overallRawResponses,
      json_structure: pageStructure,
      image_base64: resultImage,
      cost: totalCost,
    };
  }

  /*****************************************************************
   * IMPLEMENTATION AGENT  (inner ReAct loop)
   *****************************************************************/
  private async runDesignPhase(args: {
    requestMessage: UserRequestMessage;
    tools: Tools;
    model: ModelInstance;
    maxDesignTurns: number;
    mainScreenFrameId: string;
  }): Promise<{
    history: GenericMessage[];
    responses: any[];
    cost: number;
  }> {
    const { requestMessage, tools, model, maxDesignTurns, mainScreenFrameId } =
      args;

    const apiCtx = model.createMessageContext();
    const formattedCtx: GenericMessage[] = [];
    const rawResponses: any[] = [];
    let cost = 0;

    apiCtx.push(...model.formatRequest([requestMessage]));
    formattedCtx.push(requestMessage);

    const toolsArray = model.formatToolList(
      Array.from(tools.catalogue.values())
    );

    let turn = 0;
    while (turn < maxDesignTurns) {
      /* ----- Reason -------------------------------------------------- */
      const modelResponse = await model.generateResponseWithTool(
        apiCtx,
        toolsArray
      );
      rawResponses.push(modelResponse);
      cost += model.getCostFromResponse(modelResponse);

      model.addToApiMessageContext(modelResponse, apiCtx);
      model.addToFormattedMessageContext(modelResponse, formattedCtx);

      /* ----- Act ----------------------------------------------------- */
      const callToolRequests = model.formatCallToolRequest(modelResponse);
      if (!callToolRequests || callToolRequests.length === 0) {
        console.log("No tool calls detected. Exiting design phase.");
        break;
      }
      const updatedCallToolRequests = await switchParentId({
        tools: tools,
        callToolRequests: callToolRequests,
        mainScreenFrameId: mainScreenFrameId, // Assuming the first content is the main screen frame
      });

      const toolResults: CallToolResult[] = [];
      for (const tc of updatedCallToolRequests) {
        toolResults.push(await tools.callTool(tc));
      }
      /* ----- Observe ------------------------------------------------- */
      this.addToolResultsToContext(toolResults, apiCtx, formattedCtx, model);
      turn++;
    }
    return { history: formattedCtx, responses: rawResponses, cost };
  }

  // Feedback Phase
  private async runFeedbackPhase(args: {
    originalTargetText?: string;
    originalTargetImage?: ImageContent; // Optional, not used in feedback
    currentImage: ImageContent;
    pageStructureText: string;
    model: ModelInstance;
  }): Promise<{
    history: GenericMessage[];
    rawResponse: any;
    cost: number;
    instructionText: string;
  }> {
    const {
      originalTargetText,
      originalTargetImage,
      currentImage,
      pageStructureText,
      model,
    } = args;

    const formattedCtx: GenericMessage[] = [];
    let cost = 0;

    const feedbackPrompt = getFeedbackPrompt({
      originalTargetText,
      originalTargetImage,
      pageStructureText,
    });

    const content = [
      {
        type: ContentType.TEXT,
        text: feedbackPrompt,
      } as TextContent,
      currentImage,
    ];

    if (originalTargetImage) {
      content.push({
        type: ContentType.IMAGE,
        data: originalTargetImage.data,
        mimeType: originalTargetImage.mimeType,
      } as ImageContent);
    }

    const feedbackRequestMessage: UserRequestMessage = {
      id: randomUUID(),
      timestamp: Date.now(),
      role: RoleType.USER,
      type: MessageType.USER_REQUEST,
      content: content,
    };

    formattedCtx.push(feedbackRequestMessage);

    const feedbackRequestInput = model.formatRequest([feedbackRequestMessage]);
    const feedbackResp = await model.generateResponse(feedbackRequestInput);
    const feedbackMessage =
      model.formatResponseToIntermediateRequestMessage(feedbackResp);
    cost += model.getCostFromResponse(feedbackResp);
    const instructionText = this.extractTextFromContent(
      feedbackMessage.content
    );
    formattedCtx.push(feedbackMessage);

    return {
      history: formattedCtx,
      rawResponse: feedbackResp,
      cost,
      instructionText,
    };
  }

  /*****************************************************************
   * HELPERS
   *****************************************************************/
  private async getCurrentDesignSnapshot(
    tools: Tools,
    model: ModelInstance
  ): Promise<{
    imageContent: ImageContent; // original screenshot
    pageStructureText: string; // original plain-text tree
    labeledImageContent: ImageContent; // NEW – annotated PNG
  }> {
    /* ---------- image ------------------------------------------------ */
    const imgCall = tools.createToolCall("get_result_image", randomUUID());
    const imgRes = await tools.callTool(imgCall);

    if (!imgRes?.structuredContent)
      throw new Error("get_result_image returned no structured content");

    const mimeType =
      (imgRes.structuredContent.mimeType as string) || "image/png";
    const rawImage = imgRes.structuredContent.imageData as string; // base-64

    /* ---------- page structure -------------------------------------- */
    const structCall = tools.createToolCall("get_page_structure", randomUUID());
    const structRes = await tools.callTool(structCall);

    if (
      !structRes ||
      !structRes.structuredContent ||
      !structRes.structuredContent.structureTree
    )
      throw new Error("get_page_structure returned no structuredTree");

    const pageStructureTree = structRes.structuredContent.structureTree;
    if (!Array.isArray(pageStructureTree) || !pageStructureTree.length)
      throw new Error("get_page_structure returned an empty structureTree");

    const pageStructureText =
      structRes.content?.map((c: any) => c.text).join("\n") || "";

    /* ---------- annotate screenshot --------------------------------- */
    const labeledImageContent = await this.drawBoundingBoxes(
      rawImage,
      mimeType,
      pageStructureTree
    );

    return {
      imageContent: this.toImageContent(rawImage, mimeType),
      pageStructureText,
      labeledImageContent,
    };
  }

  /* ------------------------------------------------------------------ */
  /* helpers                                                            */
  /* ------------------------------------------------------------------ */

  private toImageContent(base64: string, mime: string): ImageContent {
    return {
      type: ContentType.IMAGE,
      data: base64,
      mimeType: mime,
    };
  }

  private async drawBoundingBoxes(
    base64: string,
    mime: string = "image/png",
    tree: any[]
  ): Promise<ImageContent> {
    /* ---------- colour helpers ---------- */
    const PALETTE: [number, number, number][] = [
      [230, 25, 75], // Red
      [60, 180, 75], // Green
      [0, 130, 200], // Blue
      [245, 130, 48], // Orange
      [145, 30, 180], // Purple
      [70, 240, 240], // Cyan
      [240, 50, 230], // Pink
    ];
    const rgba = (i: number, a: number) => {
      const [r, g, b] = PALETTE[i % PALETTE.length];
      return `rgba(${r},${g},${b},${a})`;
    };

    /* ---------- layout constants ---------- */
    const FONT = "12px Arial";
    const TAG_HEIGHT = 14;
    const TAG_PAD = 4;
    const GUTTER = 20; // gap between picture and each label column
    const PANEL_MARG = 16; // extra padding inside each label column
    const MIN_SPACING = 6; // minimum vertical distance between labels

    /* ---------- load the image ---------- */
    const buffer = Buffer.from(base64, "base64");
    const img = await loadImage(buffer);

    /* ---------- flatten the tree ---------- */
    const flat: any[] = [];
    (function visit(nodes: any[]) {
      nodes.forEach((n) => {
        flat.push(n);
        if (n.children?.length) visit(n.children);
      });
    })(tree);

    /* ---------- measure every label ---------- */
    const measureCtx = createCanvas(1, 1).getContext("2d");
    measureCtx.font = FONT;

    const labelMeta = flat.map((node, idx) => {
      const text = `${node.name} (ID:"${node.id}")`;
      const textW = measureCtx.measureText(text).width;
      const boxCx = node.position.x + node.size.width / 2;
      const boxCy = node.position.y + node.size.height / 2;
      return { node, idx, text, textW, boxCx, boxCy };
    });

    const maxLabelW = Math.max(...labelMeta.map((m) => m.textW)) + TAG_PAD * 2;
    const PANEL_W = maxLabelW + PANEL_MARG;
    const CANVAS_W = PANEL_W + GUTTER + img.width + GUTTER + PANEL_W;

    /* ---------- FIRST PASS: place labels & find required height ---------- */
    type Rect = { top: number; bottom: number; h: number };
    const placedLeft: Rect[] = [];
    const placedRight: Rect[] = [];

    type Placement = (typeof labelMeta)[number] & {
      side: "left" | "right";
      lblY: number;
      lblW: number;
    };
    const placements: Placement[] = [];

    labelMeta.sort((a, b) => a.boxCy - b.boxCy); // place top-to-bottom
    let maxBottom = 0;

    for (const meta of labelMeta) {
      const { boxCx, boxCy, textW } = meta;
      const side = boxCx < img.width / 2 ? "left" : "right";
      // let y = Math.round(boxCy - TAG_HEIGHT / 2);
      let y = Math.max(0, Math.round(boxCy - TAG_HEIGHT / 2));
      const list = side === "left" ? placedLeft : placedRight;

      for (const r of list) {
        // simple collision solving
        if (y + TAG_HEIGHT + MIN_SPACING <= r.top) break;
        if (y >= r.bottom + MIN_SPACING) continue;
        y = r.bottom + MIN_SPACING;
      }

      const rect = { top: y, bottom: y + TAG_HEIGHT, h: TAG_HEIGHT };
      list.push(rect);

      placements.push({ ...meta, side, lblY: y, lblW: textW + TAG_PAD * 2 });
      maxBottom = Math.max(maxBottom, rect.bottom);
    }

    /* make room if any label extends below the picture */
    const CANVAS_H = Math.max(img.height, maxBottom + PANEL_MARG);

    /* ---------- prepare canvas ---------- */
    const canvas = createCanvas(CANVAS_W, CANVAS_H);
    const ctx = canvas.getContext("2d");
    ctx.font = FONT;
    ctx.textBaseline = "top";

    /* ---------- draw background picture ---------- */
    const IMAGE_X = PANEL_W + GUTTER;
    ctx.drawImage(img, IMAGE_X, 0);

    /* ---------- SECOND PASS: actually render ---------- */
    for (const p of placements) {
      const { node, idx, text, lblY, lblW, side } = p;

      /* X position for the label column */
      const lblX =
        side === "left"
          ? PANEL_W - lblW // right-align in the left panel
          : IMAGE_X + img.width + GUTTER; // start of right panel

      /* bounding-box coordinates (shift for picture offset) */
      const {
        position: { x, y },
        size: { width, height },
      } = node;
      const boxX = IMAGE_X + x;
      const boxY = y;

      /* colours */
      const colSolid = rgba(idx, 0.75);
      const colTrans = rgba(idx, 0.25);

      /* draw bounding box */
      ctx.lineWidth = 2;
      ctx.strokeStyle = colSolid;
      ctx.setLineDash([]);
      ctx.strokeRect(boxX, boxY, width, height);

      /* label background */
      ctx.fillStyle = colTrans;
      ctx.fillRect(lblX, lblY, lblW, TAG_HEIGHT);

      /* label text */
      ctx.fillStyle = "#000";
      ctx.fillText(text, lblX + TAG_PAD, lblY + 2);

      /* dotted connector */
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      const fromX = side === "left" ? lblX + lblW : lblX;
      const boxEdge = side === "left" ? boxX : boxX + width;
      ctx.moveTo(fromX, lblY + TAG_HEIGHT / 2);
      ctx.lineTo(boxEdge, boxY + height / 2);
      ctx.strokeStyle = colSolid;
      ctx.stroke();
      ctx.setLineDash([]); // reset
    }

    /* ---------- export ---------- */
    const annotatedBuf = await canvas.encode("png");
    return this.toImageContent(annotatedBuf.toString("base64"), mime);
  }

  private buildFeedbackRequestMessage({
    feedbackInstruction,
    originalTargetImage,
    pageStructureText,
    statusImageContent,
    frameWidth,
    frameHeight,
  }: {
    feedbackInstruction: string;
    pageStructureText: string;
    statusImageContent: ImageContent;
    originalTargetImage?: ImageContent;
    frameWidth: number;
    frameHeight: number;
  }): UserRequestMessage {
    const combinedInstruction = getUpdateInstruction({
      feedbackInstruction: feedbackInstruction,
      pageStructureText: pageStructureText,
      width: frameWidth,
      height: frameHeight,
    });

    const content: (TextContent | ImageContent)[] = [
      {
        type: ContentType.TEXT,
        text: combinedInstruction.trim(),
      } as TextContent,
    ];

    content.push(statusImageContent);

    if (originalTargetImage) {
      content.push({
        type: ContentType.IMAGE,
        data: originalTargetImage.data,
        mimeType: originalTargetImage.mimeType,
      } as ImageContent);
    }

    return {
      id: randomUUID(),
      timestamp: Date.now(),
      role: RoleType.USER,
      type: MessageType.USER_REQUEST,
      content: content,
    };
  }

  private extractTextFromContent(
    contentArr: (TextContent | ImageContent | AudioContent | EmbeddedResource)[]
  ): string {
    return contentArr
      .filter((c) => c.type === ContentType.TEXT)
      .map((c) => (c as TextContent).text)
      .join("\n");
  }

  private extractImageFromContent(
    contentArr: (TextContent | ImageContent | AudioContent | EmbeddedResource)[]
  ): ImageContent | null {
    const imageContent = contentArr.find(
      (c) => c.type === ContentType.IMAGE
    ) as ImageContent | undefined;
    return imageContent || null;
  }

  private addToolResultsToContext(
    toolResults: CallToolResult[],
    apiMessageContext: any[],
    formattedMessageContext: GenericMessage[],
    model: ModelInstance
  ): void {
    for (const tr of toolResults) {
      const toolResp = model.formatToolResponse(tr);
      apiMessageContext.push(toolResp);
    }
    formattedMessageContext.push({
      id: randomUUID(),
      timestamp: Date.now(),
      role: RoleType.TOOL,
      type: MessageType.TOOL_RESPONSE,
      content: toolResults.map((r) => ({
        type: ContentType.TEXT,
        text: r.content.map((c: any) => c.text).join("\n"),
      })),
      results: toolResults,
    } as ToolResponseMessage);
  }
}
