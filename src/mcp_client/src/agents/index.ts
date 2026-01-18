import { AgentConfig, AgentType } from "../types";
import { AgentInstance } from "./agentInstance";
import { CodeReplicationAgent } from "./codeReplicationAgent";
import { ModificationAgent } from "./reactModificationAgent";
import { ReactReplicationAgent } from "./reactReplicationAgent";
import { SingleReplicationAgent } from "./singleReplicationAgent";
import { SingleModificationAgent } from "./singleModificationAgent";

// Factory for agent instances based on configured type.
export function createAgent(agentConfig: AgentConfig): AgentInstance {
  switch (agentConfig.agentType) {
    case AgentType.REACT_REPLICATION:
      return new ReactReplicationAgent(agentConfig);
    case AgentType.REACT_MODIFICATION:
      return new ModificationAgent(agentConfig);
    case AgentType.CODE_REPLICATION:
      return new CodeReplicationAgent(agentConfig);
    case AgentType.SINGLE_REPLICATION:
      return new SingleReplicationAgent(agentConfig);
    case AgentType.SINGLE_MODIFICATION:
      return new SingleModificationAgent(agentConfig);
    default:
      throw new Error(`Unsupported agent type: ${agentConfig.agentType}`);
  }
}
