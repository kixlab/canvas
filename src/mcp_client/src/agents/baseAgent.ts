import {
  UserRequestMessage,
  GenericMessage,
  AgentMetadata,
  SnapshotStructure,
} from "../types";
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
  }): Promise<{
    case_id: string;
    history: GenericMessage[];
    responses: any[];
    cost: number;
    json_structure: Object;
    turn: number;
    image_uri: string;
    snapshots: SnapshotStructure[];
  }>;
}
