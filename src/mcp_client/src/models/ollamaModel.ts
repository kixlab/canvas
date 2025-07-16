/* -------------------------------------------------------------------------- */
/*  ollamaModel.ts                                                            */
/* -------------------------------------------------------------------------- */
import ollama, {
  ChatResponse,
  Message as OllamaMessage,
  Tool as OllamaTool,
  Ollama,
} from "ollama"; // see README usage
import { randomUUID } from "crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import {
  ModelConfig,
  CallToolRequestParams,
  GenericMessage,
  ContentType,
  AgentRequestMessage,
  RoleType,
  MessageType,
  IntermediateRequestMessage,
} from "../types";
import { ModelInstance } from "./baseModel";
import { logger } from "../utils/helpers"; // optional—keeps identical logging surface

/* -------------------------------------------------------------------------- */
/*  Model implementation                                                      */
/* -------------------------------------------------------------------------- */
export class OllamaModel extends ModelInstance {
  /** No explicit per-instance client is required – the default export is
   *  already a ready-to-use singleton.  If you need a custom host (e.g.
   *  remote Ollama server or SSH tunnel) create it via:
   *        import { Ollama } from 'ollama';
   *        this.client = new Ollama({ host: process.env.OLLAMA_HOST })
   *  For now we rely on the canonical client shipped by the SDK. */
  // private client = new Ollama({ host: process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434' });

  private client;
  constructor(config: ModelConfig) {
    super(config);
    this.client = new Ollama({
      host: process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434",
    });
  }

  /* -------------------------------- Core ---------------------------------- */

  async generateResponse(
    input: OllamaMessage[],
    /** Extra chat parameters – forwarded as-is. */
    options: Partial<Parameters<typeof ollama.chat>[0]> = {}
  ): Promise<ChatResponse> {
    return await ollama.chat({
      model: this.modelName,
      messages: input,
      stream: false,
      // Runtime options live in the nested `options` object
      options: {
        temperature: this.temperature,
        num_predict: this.maxTokens,
        ...(options.options ?? {}),
      },
      ...options,
    });
  }

  async generateResponseWithTool(
    input: OllamaMessage[],
    tools: OllamaTool[],
    options: Partial<Parameters<typeof ollama.chat>[0]> = {}
  ): Promise<ChatResponse> {
    return await ollama.chat({
      model: this.modelName,
      messages: input,
      tools,
      stream: false, // simplification; streaming not yet wired here
      options: {
        temperature: this.temperature,
        num_predict: this.maxTokens,
        ...(options.options ?? {}),
      },
      ...options,
    });
  }

  /* ---------------------------- Format helpers ---------------------------- */

  /** Convert MCP GenericMessage → Ollama message objects */
  formatRequest(messages: GenericMessage[]): OllamaMessage[] {
    if (!messages?.length) throw new Error("No messages provided");

    return messages.map((msg) => {
      const role =
        msg.role === RoleType.ASSISTANT
          ? "assistant"
          : msg.role === RoleType.SYSTEM
          ? "system"
          : msg.role === RoleType.TOOL
          ? "tool"
          : "user";

      const textParts: string[] = [];
      const images: string[] = [];

      for (const item of msg.content) {
        switch (item.type) {
          case ContentType.TEXT:
            textParts.push(item.text);
            break;
          case ContentType.IMAGE:
            images.push(this.stripDataUrl(item.data));
            break;
          /* Ollama currently has no first-class audio support – ignore/throw. */
          default:
            throw new Error(
              `Unsupported content type for Ollama: ${item.type}`
            );
        }
      }

      const message: OllamaMessage = {
        role,
        content: textParts.join("\n"),
      };

      if (images.length) message.images = images;
      return message;
    });
  }

  /** Extract function-call requests from an Ollama response */
  formatCallToolRequest(response: ChatResponse): CallToolRequestParams[] {
    const calls = response.message.tool_calls ?? []; //
    return calls.map((call) => {
      const id = randomUUID();
      return {
        id,
        call_id: id,
        name: call.function?.name ?? "unknown_tool",
        arguments: call.function?.arguments ?? {},
      };
    });
  }

  /** Convert MCP tool list → Ollama tool declarations */
  formatToolList(
    tools: Awaited<ReturnType<Client["listTools"]>>["tools"]
  ): OllamaTool[] {
    return tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description ?? "",
        parameters:
          tool.inputSchema && Object.keys(tool.inputSchema).length
            ? (tool.inputSchema as Record<string, unknown>)
            : { type: "object", properties: {}, required: [] },
      },
    }));
  }

  /** Convert a tool’s result → message object usable in the next chat turn */
  formatToolResponse(result: CallToolResult): OllamaMessage {
    // if (!result.name) {
    //   logger.error({ header: "Missing tool name in result", body: result });
    // }
    const textContent = `
**tool name**
${result.name}

**content**
${result.content}

**data**
${JSON.stringify(result.structuredContent ?? {})}
`;

    return {
      role: "tool",
      // tool_name: typeof result.name === "string" ? result.name : "unknown_tool",
      content: textContent,
    };
  }

  formatImageData(imageData: string, mimeType = "image/png"): string {
    return this.stripDataUrl(imageData); // Ollama expects bare base64, not a data-URL
  }

  /* ------------- Translate Ollama responses → MCP GenericMessage ---------- */

  formatResponseToAgentRequestMessage(response: ChatResponse): GenericMessage {
    const calls = this.formatCallToolRequest(response);

    return {
      id: randomUUID(), // Ollama responses lack IDs, so generate one
      timestamp: new Date(response.created_at).getTime(),
      type: MessageType.AGENT_REQUEST,
      role: RoleType.ASSISTANT,
      content: [{ type: ContentType.TEXT, text: response.message.content }],
      calls,
    } as AgentRequestMessage;
  }

  formatResponseToIntermediateRequestMessage(
    response: ChatResponse
  ): GenericMessage {
    /* Identical text, but surfaced as an intermediate user message
       so the agent can decide whether to call tools again or finish. */
    return {
      id: randomUUID(),
      timestamp: new Date(response.created_at).getTime(),
      type: MessageType.INTERMEDIATE_REQUEST,
      role: RoleType.USER,
      content: [{ type: ContentType.TEXT, text: response.message.content }],
    } as IntermediateRequestMessage;
  }

  /* ------------------------ Context-management helpers -------------------- */

  createMessageContext(): OllamaMessage[] {
    return [];
  }

  addToApiMessageContext(response: ChatResponse, ctx: OllamaMessage[]): void {
    if (response.message) ctx.push(response.message);
  }

  addToFormattedMessageContext(
    response: ChatResponse,
    ctx: GenericMessage[]
  ): void {
    ctx.push(this.formatResponseToAgentRequestMessage(response));
  }

  /* ------------------------------ Billing --------------------------------- */

  /** Ollama’s API does **not** provide token-level usage metrics yet, so cost
   *  tracking cannot be implemented.  We return `0` */
  getCostFromResponse(_response: ChatResponse): number {
    return 0;
  }

  /* ------------------------------- Utils ---------------------------------- */

  private stripDataUrl(data: string): string {
    return data.replace(/^data:[^;]+;base64,/, "");
  }
}
