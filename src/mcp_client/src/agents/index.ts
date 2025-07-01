import { AgentType } from "../types";
import { AgentInstance } from "./baseAgent";
import { FeedbackAgent } from "./feedbackAgent";
import { ReactAgent } from "./reactAgent";
import { VisualAgent } from "./visualAgent";

export function createAgent(agentType: AgentType): AgentInstance {
  switch (agentType) {
    case AgentType.REACT:
      return new ReactAgent();
    case AgentType.VISUAL:
      return new VisualAgent();
    case AgentType.FEEDBACK:
      return new FeedbackAgent();
    default:
      throw new Error(`Unsupported agent type: ${agentType}`);
  }
}
