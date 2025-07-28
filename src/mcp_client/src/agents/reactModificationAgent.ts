import { randomUUID } from "crypto";
import {
  UserRequestMessage,
  GenericMessage,
  AgentMetadata,
  RoleType,
  MessageType,
  ContentType,
  ToolResponseMessage,
  SnapshotStructure,
} from "../types";
import { ModelInstance } from "../models/baseModel";
import { Tools } from "../core/tools";
import { AgentInstance } from "./baseAgent";
import {
  switchParentId,
  getPageStructure,
  clearPage,
  isPageClear,
  getPageImage,
  logger,
} from "../utils/helpers";
import { MINIMUM_MODIFICATION_TURN } from "../utils/config";

export class ModificationAgent extends AgentInstance {
  async run(params: {
    requestMessage: UserRequestMessage;
    tools: Tools;
    model: ModelInstance;
    baseJsonString: string;
    metadata: AgentMetadata;
  }): Promise<{
    case_id: string;
    history: GenericMessage[];
    responses: any[];
    cost: number;
    json_structure: Object;
    turn: number;
    image_uri: string;
    snapshots: SnapshotStructure[];
  }> {
    // Step 0: Check page and position the load the design.
    logger.log({
      header: "ReAct Agent Generation Started",
      body: `Model: ${params.model.modelName}, Provider: ${params.model.modelProvider}, Max Turns: ${this.maxTurns}`,
    });

    const pageStatus = await isPageClear(params.tools);
    if (!pageStatus) {
      logger.info({
        header: "Page is not clear. Clearing the page...",
      });
      await clearPage(params.tools);
    }

    const loadJsonRequest = params.tools.createToolCall(
      "import_json",
      randomUUID(),
      {
        jsonString: params.baseJsonString,
      }
    );
    const response = await params.tools.callTool(loadJsonRequest);
    if (response.isError) {
      const errorMessage = response.content.map((c) => c.text).join("\n");
      throw new Error(
        `Failed to load base JSON: ${errorMessage || "Unknown error"}`
      );
    }

    const mainScreenFrameId = response.structuredContent!.rootFrameId as string;
    if (!mainScreenFrameId) {
      throw new Error(
        "Failed to load base JSON: No main screen frame ID returned"
      );
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
    const snapshots = new Array<SnapshotStructure>();

    apiMessageContext.push(...initialRequest);
    formattedMessageContext.push(params.requestMessage);

    // Step 3: Create an environment
    let turn = 0;
    let cost = 0;

    // ReAct Loop: Reason -> Act -> Observe
    while (turn < this.maxTurns) {
      // Reason: Generate response with tools
      logger.info({
        header: `ReAct agent - loop turn ${turn} of maximum ${this.maxTurns}`,
      });
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
        MessageType.AGENT_REQUEST,
        formattedMessageContext
      );

      // Check if tool calls are needed
      const callToolRequests =
        params.model.formatCallToolRequest(modelResponse);

      if (!callToolRequests || callToolRequests.length === 0) {
        logger.info({
          header: "No tool calls detected. Exiting ReAct loop.",
        });
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

      // Save Snapshot: Capture the current state of the page
      const screenSnapshot = await getPageImage(params.tools);
      const structureSnapshot = await getPageStructure(params.tools);
      snapshots.push({
        case_id: params.metadata.caseId,
        init: turn === 0 ? true : false, // First turn is not feedback
        turn,
        image_uri: screenSnapshot,
        structure: structureSnapshot,
        toolResults: toolResults,
      });

      // Increment turn count
      turn++;
    }

    // Check if we need to re-run due to insufficient turns
    if (turn < MINIMUM_MODIFICATION_TURN) {
      logger.error({
        header: `Minimum turn requirement not met. Re-running the process...`,
        body: `Completed with only ${turn} turns (less than ${MINIMUM_MODIFICATION_TURN})`,
      });

      // Clear the page and re-run
      await clearPage(params.tools);
      return this.run(params);
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
      turn: turn,
      snapshots, // Include snapshots in the result
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
