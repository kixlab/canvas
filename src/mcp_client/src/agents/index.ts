import { AgentConfig, AgentType } from "../types";
import { AgentInstance } from "./baseAgent";
import { CodeAgent } from "./codeAgent";
import { FeedbackAgent } from "./feedbackAgent";
import { ModificationAgent } from "./modificationAgent";
import { ReactAgent } from "./reactAgent";
import { SingleAgent } from "./singleAgent";

export function createAgent(agentConfig: AgentConfig): AgentInstance {
  switch (agentConfig.agentType) {
    case AgentType.REACT:
      return new ReactAgent(agentConfig);
    case AgentType.FEEDBACK:
      return new FeedbackAgent(agentConfig);
    case AgentType.MODIFICATION:
      return new ModificationAgent(agentConfig);
    case AgentType.CODE:
      return new CodeAgent(agentConfig);
    case AgentType.SINGLE:
      return new SingleAgent(agentConfig);
    default:
      throw new Error(`Unsupported agent type: ${agentConfig.agentType}`);
  }
}
