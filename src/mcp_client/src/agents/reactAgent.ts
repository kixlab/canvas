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
  switchParentId,
  intializeMainScreenFrame,
  getPageStructure,
  clearPage,
  isPageClear,
  getPageImage,
} from "../utils/helpers";

export class ReactAgent extends AgentInstance {
  async run(params: {
    requestMessage: UserRequestMessage;
    tools: Tools;
    model: ModelInstance;
    metadata: AgentMetadata;
    maxTurns: number;
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

    // Step 1: Initialize parameters
    const initialRequest = params.model.formatRequest([params.requestMessage]);
    const toolsArray = params.model.formatToolList(
      Array.from(params.tools.catalogue.values())
    );

    // Step 2: Prepare message contexts
    const apiMessageContext = params.model.createMessageContext();
    const formattedMessageContext = new Array<GenericMessage>();
    const rawResponses = new Array();

    apiMessageContext.push(...initialRequest);
    formattedMessageContext.push(params.requestMessage);

    // Step 3: Create an environment
    let turn = 0;
    let cost = 0;
    const { mainScreenFrameId } = await intializeMainScreenFrame(
      params.requestMessage,
      params.tools
    );

    // ReAct Loop: Reason -> Act -> Observe
    while (turn < this.maxTurns) {
      // Reason: Generate response with tools
      const modelResponse = await params.model.generateResponseWithTool(
        apiMessageContext,
        toolsArray
      );

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

      const updatedCallToolRequests = await switchParentId({
        tools: params.tools,
        callToolRequests,
        mainScreenFrameId,
      });

      // Act: Execute tool calls
      const toolResults = [];
      for (const toolCall of updatedCallToolRequests) {
        toolResults.push(await params.tools.callTool(toolCall));
      }

      // Observe: Add tool results to context
      this.addToolResultsToContext(
        toolResults,
        apiMessageContext,
        formattedMessageContext,
        params.model
      );

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
    toolResults: any[],
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
}
