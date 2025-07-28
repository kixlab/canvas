import { AgentConfig, AgentType } from "../types";
import { AgentInstance } from "./baseAgent";
import { CodeAgent } from "./codeAgent";
import { FeedbackAgent } from "./feedbackAgent";
import { ModificationAgent } from "./reactModificationAgent";
import { ReactAgent } from "./reactAgent";
import { SingleAgent } from "./singleAgent";
import { SingleModificationAgent } from "./singleModificationAgent";

export function createAgent(agentConfig: AgentConfig): AgentInstance {
  switch (agentConfig.agentType) {
    case AgentType.REACT_REPLICATION:
      return new ReactAgent(agentConfig);
    case AgentType.FEEDBACK:
      return new FeedbackAgent(agentConfig);
    case AgentType.REACT_MODIFICATION:
      return new ModificationAgent(agentConfig);
    case AgentType.CODE_REPLICATION:
      return new CodeAgent(agentConfig);
    case AgentType.SINGLE_REPLICATION:
      return new SingleAgent(agentConfig);
    case AgentType.SINGLE_MODIFICATION:
      return new SingleModificationAgent(agentConfig);
    default:
      throw new Error(`Unsupported agent type: ${agentConfig.agentType}`);
  }
}
