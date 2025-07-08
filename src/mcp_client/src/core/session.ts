import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { ServerStatus } from "../types";
import { Tools } from "./tools";

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
  status: ServerStatus;
}

export class Session {
  state: SessionState;

  constructor() {
    this.state = {
      client: null,
      transport: null,
      tools: null,
      status: ServerStatus.CLOSED,
    };
  }

  async initialize(): Promise<void> {
    if (this.state.status === ServerStatus.READY) {
      console.log("Agent already loaded");
      return;
    }

    try {
      // (1) Initialize MCP Client
      this.state.transport = new StdioClientTransport({
        command: "node",
        args: [SERVER_PATH],
      });
      this.state.client = new Client(
        { name: "mcp-client", version: "1.0.0" },
        { capabilities: {} }
      );
      this.state.client.connect(this.state.transport);

      // (2) Tool Loading
      this.state.tools = new Tools(this.state.client);
      await this.state.tools.loadTools();
      console.log(
        `Agent initialized with ${this.state.tools.catalogue.size} tools`
      );
    } catch (error) {
      console.error("Failed to initialize agent:", error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (
      this.state.status !== ServerStatus.READY &&
      this.state.status !== ServerStatus.ERROR
    )
      return;

    try {
      if (this.state.client) {
        await this.state.client.close();
      }

      this.state.client = null;
      this.state.transport = null;
      this.state.tools?.catalogue.clear();
      this.state.tools = null;
      this.state.status = ServerStatus.CLOSED;

      console.log("Agent shutdown complete");
    } catch (error) {
      console.error("Error during shutdown:", error);
    }
  }
}

export const globalSession = new Session();
