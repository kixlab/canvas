import { AgentType } from "../types";
import { AgentInstance } from "./baseAgent";
import { ReactAgent } from "./reactAgent";
import { VisualAgent } from "./visualAgent";

export function createAgent(agentType: AgentType): AgentInstance {
  switch (agentType) {
    case AgentType.REACT:
      return new ReactAgent();
    case AgentType.VISUAL:
      return new VisualAgent();
    default:
      throw new Error(`Unsupported agent type: ${agentType}`);
  }
}
