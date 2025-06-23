import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { loadServerConfig } from "../utils/helpers";
import { AgentType, ToolItem } from "../types";
import { Tools } from "./tools";
import { createModel } from "../models";
import { ModelInstance } from "../models/baseModel";

const SERVER_PATH = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "mcp_server",
  "dist",
  "server.js"
);

export interface SessionState {
  client: Client | null;
  transport: StdioClientTransport | null;
  tools: Tools | null;
  model: ModelInstance | null;
  agentType: AgentType | null;
  initialized: boolean;
  currentChannel: string | null;
  rootFrame: {
    id: string | null;
    width: number;
    height: number;
  };
}

export class Session {
  state: SessionState;

  constructor() {
    this.state = {
      client: null,
      transport: null,
      tools: null,
      model: null,
      agentType: null,
      initialized: false,
      currentChannel: null,
      rootFrame: { id: null, width: 0, height: 0 },
    };
  }

  async initialize(agentType: AgentType = AgentType.REACT): Promise<void> {
    if (this.state.initialized) {
      console.log("Agent already initialized");
      return;
    }

    try {
      const serverConfig = loadServerConfig(agentType);
      if (!serverConfig.models?.length) {
        throw new Error("No models defined in config");
      }
      const [modelConfig] = serverConfig.models;

      // Internal Variable Initialization
      this.state.transport = new StdioClientTransport({
        command: "node",
        args: [SERVER_PATH],
      });
      this.state.client = new Client(
        { name: "mcp-client", version: "1.0.0" },
        { capabilities: {} }
      );
      this.state.client.connect(this.state.transport);
      this.state.tools = new Tools(this.state.client);
      await this.state.tools.loadTools();
      this.state.model = createModel(modelConfig);
      this.state.agentType = serverConfig.agent_type;
      this.state.initialized = true;

      console.log(
        `Agent initialized with ${this.state.tools.catalogue.size} tools`
      );
    } catch (error) {
      console.error("Failed to initialize agent:", error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (!this.state.initialized) return;

    try {
      if (this.state.client) {
        await this.state.client.close();
      }

      this.state.client = null;
      this.state.transport = null;
      this.state.tools?.catalogue.clear();
      this.state.tools = null;
      this.state.initialized = false;

      console.log("Agent shutdown complete");
    } catch (error) {
      console.error("Error during shutdown:", error);
    }
  }

  isInitialized(): boolean {
    return this.state.initialized;
  }

  // App state management
  setCurrentChannel(channel: string | null): void {
    this.state.currentChannel = channel;
  }

  setRootFrame(id: string | null, width: number, height: number): void {
    this.state.rootFrame = { id, width, height };
  }
}

export const globalSession = new Session();
