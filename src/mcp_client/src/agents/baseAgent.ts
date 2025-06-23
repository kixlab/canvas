import { UserRequestMessage, GenericMessage, AgentMetadata } from "../types";
import { ModelInstance } from "../models/baseModel";
import { Tools } from "../core/tools";

export abstract class AgentInstance {
  abstract run(params: {
    requestMessage: UserRequestMessage;
    model: ModelInstance;
    tools: Tools;
    metadata?: AgentMetadata;
    maxTurns?: number;
  }): Promise<{ history: GenericMessage[]; responses: any[]; cost: number }>;
}
