import { AgentConfig, AgentType } from "../types";
import { AgentInstance } from "./baseAgent";
import { FeedbackAgent } from "./feedbackAgent";
import { ModificationAgent } from "./modificationAgent";
import { ReactAgent } from "./reactAgent";

export function createAgent(agentConfig: AgentConfig): AgentInstance {
  switch (agentConfig.agentType) {
    case AgentType.REACT:
      return new ReactAgent(agentConfig);
    case AgentType.FEEDBACK:
      return new FeedbackAgent(agentConfig);
    case AgentType.MODIFICATION:
      return new ModificationAgent(agentConfig); // Assuming ModificationAgent extends ReactAgent
    default:
      throw new Error(`Unsupported agent type: ${agentConfig.agentType}`);
  }
}
