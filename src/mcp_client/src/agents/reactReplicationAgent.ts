import { randomUUID } from "crypto";
import {
  AgentMetadata,
  ContentType,
  GenericMessage,
  MessageType,
  RoleType,
  SnapshotStructure,
  ToolResponseMessage,
  UserRequestMessage,
} from "../types";
import { ModelInstance } from "../models/modelInstance";
import { Tools } from "../core/tools";
import { AgentInstance } from "./agentInstance";
import {
  clearPage,
  getPageImage,
  getPageStructure,
  intializeMainScreenFrame,
  isPageClear,
  logger,
  switchParentId,
} from "../utils/helpers";
import { MINIMUM_TURN } from "../utils/config";

export class ReactReplicationAgent extends AgentInstance {
  // Multi-turn ReAct loop for generating a new UI from scratch.
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
    turn: number;
    image_uri: string;
    snapshots: SnapshotStructure[];
  }> {
    logger.log({
      header: "ReAct Replication Agent Generation Started",
      body: `Model: ${params.model.modelName}, Provider: ${params.model.modelProvider}, Max Turns: ${this.maxTurns}`,
    });

    if (!(await isPageClear(params.tools))) {
      logger.info({ header: "Page is not clear. Clearing the page..." });
      await clearPage(params.tools);
    }

    const apiMessageContext = params.model.createMessageContext();
    const formattedMessageContext: GenericMessage[] = [];
    const rawResponses: any[] = [];
    const snapshots: SnapshotStructure[] = [];

    apiMessageContext.push(...params.model.formatRequest([params.requestMessage]));
    formattedMessageContext.push(params.requestMessage);

    const toolsArray = params.model.formatToolList(
      Array.from(params.tools.catalogue.values())
    );

    let turn = 0;
    let cost = 0;
    const { mainScreenFrameId } = await intializeMainScreenFrame(
      params.requestMessage,
      params.tools
    );

    while (turn < this.maxTurns) {
      logger.info({
        header: `ReAct replication - loop turn ${turn} of maximum ${this.maxTurns}`,
      });

      const modelResponse = await params.model.generateResponseWithTool(
        apiMessageContext,
        toolsArray
      );

      rawResponses.push(modelResponse);
      cost += params.model.getCostFromResponse(modelResponse);

      params.model.addToApiMessageContext(modelResponse, apiMessageContext);
      params.model.addToFormattedMessageContext(
        modelResponse,
        MessageType.AGENT_REQUEST,
        formattedMessageContext
      );

      const callToolRequests =
        params.model.formatCallToolRequest(modelResponse);
      if (!callToolRequests || callToolRequests.length === 0) {
        logger.info({ header: "No tool calls detected. Exiting ReAct loop." });
        break;
      }

      const updatedCallToolRequests = await switchParentId({
        tools: params.tools,
        callToolRequests,
        mainScreenFrameId,
      });

      const toolResults = [];
      for (const toolCall of updatedCallToolRequests) {
        toolResults.push(await params.tools.callTool(toolCall));
      }

      this.addToolResultsToContext(
        toolResults,
        apiMessageContext,
        formattedMessageContext,
        params.model
      );

      const screenSnapshot = await getPageImage(params.tools);
      const structureSnapshot = await getPageStructure(params.tools);
      snapshots.push({
        case_id: params.metadata.caseId,
        init: turn === 0 ? true : false,
        turn,
        image_uri: screenSnapshot,
        structure: structureSnapshot,
        toolResults,
      });

      turn++;
    }

    if (turn < MINIMUM_TURN) {
      logger.error({
        header: "Minimum turn requirement not met. Re-running the process...",
        body: `Completed with only ${turn} turns (less than ${MINIMUM_TURN})`,
      });
      await clearPage(params.tools);
      return this.run(params);
    }

    const pageStructure = await getPageStructure(params.tools);
    const resultImage = await getPageImage(params.tools);
    await clearPage(params.tools);

    return {
      case_id: params.metadata.caseId,
      history: formattedMessageContext,
      responses: rawResponses,
      json_structure: pageStructure,
      image_uri: resultImage,
      turn,
      snapshots,
      cost: cost / 1000,
    };
  }

  private addToolResultsToContext(
    toolResults: any[],
    apiMessageContext: any[],
    formattedMessageContext: GenericMessage[],
    model: ModelInstance
  ): void {
    // Keep API context in tool-response format and formatted context in app schema.
    for (const toolResult of toolResults) {
      apiMessageContext.push(model.formatToolResponse(toolResult));
    }

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
