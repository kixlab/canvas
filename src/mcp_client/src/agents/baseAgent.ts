import { UserRequestMessage, GenericMessage, AgentMetadata } from "../types";
import { ModelInstance } from "../models/baseModel";
import { Tools } from "../core/tools";

export abstract class AgentInstance {
  public maxTurns: number;
  public maxRetries?: number;

  constructor(agentConfig: { maxTurns: number; maxRetries?: number }) {
    this.maxTurns = agentConfig.maxTurns;
    this.maxRetries = agentConfig.maxRetries;
  }

  abstract run(params: {
    requestMessage: UserRequestMessage;
    model: ModelInstance;
    tools: Tools;
    metadata?: AgentMetadata;
  }): Promise<{ history: GenericMessage[]; responses: any[]; cost: number }>;
}
