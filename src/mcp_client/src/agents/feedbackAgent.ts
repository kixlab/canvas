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
  IntermediateRequestMessage,
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
import {
  combineFeedbackInstruction,
  getFeedbackPrompt,
} from "../utils/prompts";

// [TODO] Integrate the max turns for design phase to the pipeline
const MAX_DESIGN_TURNS = 3;

export class FeedbackAgent extends AgentInstance {
  async run(params: {
    requestMessage: UserRequestMessage;
    tools: Tools;
    model: ModelInstance;
    metadata: AgentMetadata;
    maxTurns: number;
  }): Promise<{ history: GenericMessage[]; responses: any[]; cost: number }> {
    params.maxTurns = params.maxTurns || 3;
    params.metadata = params.metadata || { input_id: randomUUID() };

    const overallHistory: GenericMessage[] = [];
    const overallRawResponses: any[] = [];
    let totalCost = 0;

    const originalTargetText = this.extractTextFromContent(
      params.requestMessage.content
    );
    const originalTargetImage = this.extractImageFromContent(
      params.requestMessage.content
    );

    // Initial user request message
    let currentRequestMessage: UserRequestMessage = params.requestMessage;

    /* --- Feedback Loop ------------------------------------------------ */
    for (let iteration = 0; iteration < params.maxTurns; iteration++) {
      // (1) Run design
      const designResult = await this.runDesignPhase({
        requestMessage: currentRequestMessage,
        tools: params.tools,
        model: params.model,
        maxDesignTurns: MAX_DESIGN_TURNS,
      });

      console.log(
        `[FeedbackAgent] A design completed - turn ${iteration} | cost: ${totalCost}`
      );

      overallHistory.push(...designResult.history);
      overallRawResponses.push(...designResult.responses);
      totalCost += designResult.cost / 1000; // Convert to USD

      // (2) Get UI Snapshot
      const { imageContent: currentImage, pageStructureText } =
        await this.getCurrentDesignSnapshot(params.tools, params.model);

      // (3) Feedback Phase
      const feedbackResult = await this.runFeedbackPhase({
        originalTargetText: originalTargetText ?? undefined,
        originalTargetImage: originalTargetImage ?? undefined,
        currentImage,
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
        originalTargetText: originalTargetText ?? undefined,
        originalTargetImage: originalTargetImage ?? undefined,
        pageStructureText: pageStructureText ?? undefined,
      });
    }

    return {
      history: overallHistory,
      responses: overallRawResponses,
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
  }): Promise<{
    history: GenericMessage[];
    responses: any[];
    cost: number;
  }> {
    const { requestMessage, tools, model, maxDesignTurns } = args;

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
      if (!callToolRequests || callToolRequests.length === 0) break;

      const toolResults: CallToolResult[] = [];
      for (const tc of callToolRequests) {
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

    const feedbackInstruction: IntermediateRequestMessage = {
      id: randomUUID(),
      timestamp: Date.now(),
      role: RoleType.USER,
      type: MessageType.INTERMEDIATE_REQUEST,
      content: content,
    };

    formattedCtx.push(feedbackInstruction);

    const formattedFeedbackInput = model.formatRequest([feedbackInstruction]);
    const feedbackResp = await model.generateResponse(formattedFeedbackInput);

    cost += model.getCostFromResponse(feedbackResp);
    model.addToFormattedMessageContext(feedbackResp, formattedCtx);

    // grab the assistant’s plain-text reply
    const lastMsg = formattedCtx[formattedCtx.length - 1];
    const instructionText = this.extractTextFromContent(lastMsg.content);

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
  ): Promise<{ imageContent: ImageContent; pageStructureText: string }> {
    /* ----- image ---------------------------------------------------- */
    const imgCall = tools.createToolCall("get_result_image", randomUUID());
    const imgRes = await tools.callTool(imgCall);
    if (!imgRes?.structuredContent) {
      throw new Error("get_result_image returned no structured content");
    }

    const mimeType =
      (imgRes.structuredContent.mimeType as string) || "image/png";
    const rawImage = imgRes.structuredContent.imageData as string;
    const imageContent: ImageContent = {
      type: ContentType.IMAGE,
      data: model.formatImageData(rawImage, mimeType),
      mimeType,
    };

    /* ----- page structure ------------------------------------------ */
    const structCall = tools.createToolCall("get_page_structure", randomUUID());
    const structRes = await tools.callTool(structCall);

    if (!structRes?.content || structRes.content.length === 0) {
      throw new Error("get_page_structure returned no content");
    }

    const pageStructureText =
      structRes?.content?.map((c: any) => c.text).join("\n") || "";

    return { imageContent, pageStructureText };
  }

  private buildFeedbackRequestMessage({
    feedbackInstruction,
    originalTargetText,
    originalTargetImage,
    pageStructureText,
  }: {
    feedbackInstruction: string;
    pageStructureText: string;
    originalTargetText?: string;
    originalTargetImage?: ImageContent;
  }): UserRequestMessage {
    const combinedInstruction = combineFeedbackInstruction({
      feedbackInstruction: feedbackInstruction,
      originalTargetText: originalTargetText ?? undefined,
      pageStructureText: pageStructureText,
    });

    const content: (TextContent | ImageContent)[] = [
      {
        type: ContentType.TEXT,
        text: combinedInstruction.trim(),
      } as TextContent,
    ];

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
