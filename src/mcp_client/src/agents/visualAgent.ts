// No specific name is provided for this agent; refer to https://arxiv.org/pdf/2401.13919
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
  CallToolResult,
  ImageContent,
  TextContent,
} from "@modelcontextprotocol/sdk/types";
import {
  clearPage,
  getPageImage,
  getPageStructure,
  isPageClear,
} from "../utils/helpers";

export class VisualAgent extends AgentInstance {
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
    image_uri: string;
  }> {
    // Step 0: Check page
    const pageStatus = await isPageClear(params.tools);
    if (!pageStatus) {
      console.log("Page is not clear. Clearing the page...");
      await clearPage(params.tools);
    }

    // initialize the maxTurns
    const initialRequest = params.model.formatRequest([params.requestMessage]);
    const toolsArray = params.model.formatToolList(
      Array.from(params.tools.catalogue.values())
    );
    const apiMessageContext = params.model.createMessageContext();
    const formattedMessageContext = new Array<GenericMessage>();
    const rawResponses = new Array();

    apiMessageContext.push(...initialRequest);
    formattedMessageContext.push(params.requestMessage);

    let turn = 0;
    let cost = 0;

    // ReAct Loop: Reason -> Act -> Observe
    while (turn < this.maxTurns) {
      // Reason: Generate response with tools
      const modelResponse = await params.model.generateResponseWithTool(
        apiMessageContext,
        toolsArray
      );

      console.log(modelResponse);

      rawResponses.push(modelResponse);
      cost += params.model.getCostFromResponse(modelResponse);

      // Update context with model response
      params.model.addToApiMessageContext(modelResponse, apiMessageContext);
      params.model.addToFormattedMessageContext(
        modelResponse,
        formattedMessageContext
      );

      // Check if tool calls are needed
      const callToolRequests =
        params.model.formatCallToolRequest(modelResponse);

      if (!callToolRequests || callToolRequests.length === 0) {
        console.log("No tool calls detected. Exiting ReAct loop.");
        break;
      }

      // Act: Execute tool calls
      const toolResults = [];
      for (const toolCall of callToolRequests) {
        toolResults.push(await params.tools.callTool(toolCall));
      }

      // Observe: Add tool results to context
      this.addToolResultsToContext(
        toolResults,
        apiMessageContext,
        formattedMessageContext,
        params.model
      );

      // Observe: Get the result image as a user message
      const getResultTool = params.tools.catalogue.get("get_result_image");
      if (!getResultTool) {
        throw new Error("get_result_image tool not found in tools catalog.");
      }

      const getResultToolCall = params.tools.createToolCall(
        "get_result_image",
        randomUUID()
      );

      const getResultToolResponse = await params.tools.callTool(
        getResultToolCall
      );
      if (!getResultToolResponse || !getResultToolResponse.content) {
        throw new Error("Failed to get result image from tool call.");
      }
      const observationMessage = this.formatResultImageToUserRequestMessage(
        getResultToolResponse,
        "This is the image of the result of the tool calls. Reflect on the result and complete the UI design.",
        params.model
      );
      formattedMessageContext.push(observationMessage);
      const intermediateRequest = params.model.formatRequest([
        observationMessage,
      ]);
      apiMessageContext.push(...intermediateRequest);

      // Logging the result
      turn++;
    }

    // Get page structure and image
    const pageStructure = await getPageStructure(params.tools);
    const resultImage = await getPageImage(params.tools);
    await clearPage(params.tools);

    return {
      case_id: params.metadata.caseId,
      history: formattedMessageContext,
      responses: rawResponses,
      json_structure: pageStructure,
      image_uri: resultImage,
      cost: cost / 1000, // Convert to USD
    };
  }

  private addToolResultsToContext(
    toolResults: CallToolResult[],
    apiMessageContext: any[],
    formattedMessageContext: GenericMessage[],
    model: any
  ): void {
    // Add to API context
    for (const toolResult of toolResults) {
      const toolResponse = model.formatToolResponse(toolResult);
      apiMessageContext.push(toolResponse);
    }

    // Add to formatted context
    formattedMessageContext.push({
      id: randomUUID(),
      timestamp: Date.now(),
      role: RoleType.TOOL,
      type: MessageType.TOOL_RESPONSE,
      content: toolResults.map((result) => ({
        type: ContentType.TEXT,
        text: result.content.map((c: any) => c.text).join("\n"),
      })),
      results: toolResults,
    } as ToolResponseMessage);
  }

  private formatResultImageToUserRequestMessage(
    callToolResult: CallToolResult,
    userMessage: string,
    model: ModelInstance
  ): UserRequestMessage {
    if (!callToolResult || !callToolResult.content) {
      throw new Error("Invalid tool response format");
    }

    const mimeType =
      (callToolResult.structuredContent?.mimeType as string) || "image/png";
    const imageData =
      (callToolResult.structuredContent?.imageData as string) || "";
    const imageContent = {
      type: ContentType.IMAGE,
      data: model.formatImageData(imageData, mimeType),
      mimeType: mimeType,
    } as ImageContent;
    const intermediateInstruction = {
      type: ContentType.TEXT,
      text: userMessage || "Please provide an instruction for the image.",
    } as TextContent;

    const content = [imageContent, intermediateInstruction] as Array<
      TextContent | ImageContent
    >;

    return {
      id: randomUUID(),
      timestamp: Date.now(),
      role: RoleType.USER,
      type: MessageType.USER_REQUEST,
      content: content,
    } as UserRequestMessage;
  }
}
