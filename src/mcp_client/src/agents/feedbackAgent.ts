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
  UserFeedbackMessage,
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
        `[ALERT] A design completed - turn ${iteration} | cost: ${totalCost}`
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
      const instructionText = feedbackResult.instructionText.trim();

      console.log(
        `[ALERT] A feedback completed - turn ${iteration}: ${instructionText} | cost: ${totalCost}`
      );

      // Early exit if feedback agent declares design finished
      if (/^DESIGN_COMPLETE$/i.test(instructionText)) {
        break;
      }

      // (4) Prepare for next iteration
      currentRequestMessage = this.buildNewRequestMessage({
        instruction: instructionText,
        originalTargetText: originalTargetText ?? undefined,
        originalTargetImage: originalTargetImage ?? undefined,
      });
      overallHistory.push(currentRequestMessage);
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
    const rawResponses: any[] = [];
    let cost = 0;

    const feedbackPromptArray = [
      `You are a feedback agent tasked with evaluating the design of a user interface. `,
      `You will receive a screenshot of the current design and a target description. `,
      `Your job is to compare the two and provide concise feedback on how to improve the design. `,
      `If the design already matches the target, simply reply with "DESIGN_COMPLETE". `,
      `Otherwise, provide specific instructions on what needs to change. `,
    ];

    if (originalTargetText) {
      feedbackPromptArray.push(
        `Target description:\n${originalTargetText}\n\n`
      );
    }

    feedbackPromptArray.push(
      `Current page structure:\n${pageStructureText}\n\n`
    );

    if (originalTargetImage) {
      feedbackPromptArray.push(
        `The target image screenshot is provided as a second image.\n\n`
      );
    }

    const content = [
      {
        type: ContentType.TEXT,
        text: feedbackPromptArray.join("\n"),
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
    rawResponses.push(feedbackResp);
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

  private buildNewRequestMessage({
    instruction,
    originalTargetText,
    originalTargetImage,
  }: {
    instruction: string;
    originalTargetText?: string;
    originalTargetImage?: ImageContent;
  }): UserRequestMessage {
    const combinedInstruction = `${
      originalTargetText ?? ""
    }\n\n[ADDITIONAL INSTRUCTION]\nPlease update the design as follows:\n${instruction}
    `;
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
