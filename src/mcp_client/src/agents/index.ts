import { AgentType } from "../types";
import { AgentInstance } from "./baseAgent";
import { ReactAgent } from "./reactAgent";

export function createAgent(agentType: AgentType): AgentInstance {
  switch (agentType) {
    case AgentType.REACT:
      return new ReactAgent();
    default:
      throw new Error(`Unsupported agent type: ${agentType}`);
  }
}
