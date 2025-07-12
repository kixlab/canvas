import { AgentConfig, AgentType } from "../types";
import { AgentInstance } from "./baseAgent";
import { FeedbackAgent } from "./feedbackAgent";
import { ReactAgent } from "./reactAgent";

export function createAgent(agentConfig: AgentConfig): AgentInstance {
  switch (agentConfig.agentType) {
    case AgentType.REACT:
      return new ReactAgent(agentConfig);
    case AgentType.FEEDBACK:
      return new FeedbackAgent(agentConfig);
    default:
      throw new Error(`Unsupported agent type: ${agentConfig.agentType}`);
  }
}
