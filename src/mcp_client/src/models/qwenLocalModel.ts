import { randomUUID } from "crypto";
import {
  AgentRequestMessage,
  CallToolRequestParams,
  ContentType,
  GenericMessage,
  MessageType,
  ModelConfig,
  RoleType,
} from "../types";
import { ModelInstance } from "./baseModel";

type APIMessages = Array<
  | { role: "system" | "user" | "assistant" | "tool"; content: string }
  | {
      role: "user";
      content: Array<
        | { type: "text"; text: string }
        | { type: "image"; image: string }
      >;
    }
>;

type APIResponse =
  | { type: "answer"; text: string }
  | {
      type: "tool_used";
      tool_call: { tool_name: string; arguments: any };
      tool_result?: any;
      final?: string;
    };

export class QwenLocalModel extends ModelInstance {
  private baseUrl: string;
  private requestTimeoutMs: number;
  private maxHistoryMessages: number;

  constructor(config: ModelConfig & { baseUrl?: string }) {
    super(config);
    this.baseUrl =
      config.baseUrl || process.env.QWEN_LOCAL_BASE_URL || "http://143.248.48.119:8000";
    this.requestTimeoutMs = Number(process.env.QWEN_LOCAL_TIMEOUT_MS || 60000);
    this.maxHistoryMessages = Number(process.env.QWEN_LOCAL_MAX_HISTORY || 8);
  }

  /* Core generation helpers */
  async generateResponse(messages: any[], options: any = {}): Promise<any> {
    const apiMessages = this.formatApiMessages(messages);
    const payload = {
      messages: apiMessages,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      ...(options || {}),
    };
    return await this.postChat(payload);
  }

  async generateResponseWithTool(
    messages: any[],
    tools: any[],
    options: any = {}
  ): Promise<any> {
    const apiMessages = this.formatApiMessages(messages);
    const apiTools = Array.isArray(tools)
      ? tools.map((t: any) => ({
          name: t.function?.name || t.name,
          description: t.function?.description || t.description || "",
          parameters:
            t.function?.parameters || t.inputSchema || t.parameters || {
              type: "object",
              properties: {},
              required: [],
            },
        }))
      : [];

    const payload = {
      messages: apiMessages,
      tools: apiTools.length ? apiTools : undefined,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      ...(options || {}),
    };
    return await this.postChat(payload);
  }

  /* Formatting helpers */
  formatRequest(messages: GenericMessage[]): any[] {
    return this.formatApiMessages(messages);
  }

  formatCallToolRequest(response: any): CallToolRequestParams[] {
    if (!response) return [];
    if (response.type === "tool_used" && response.tool_call) {
      const id = randomUUID();
      return [
        {
          id,
          call_id: id,
          name: response.tool_call.tool_name,
          arguments: response.tool_call.arguments || {},
        } as any,
      ];
    }
    return [];
  }

  formatToolList(tools: any[]): any[] {
    return tools.map((tool: any) => ({
      name: tool.name,
      description: tool.description ?? "",
      parameters: tool.inputSchema ?? {
        type: "object",
        properties: {},
        required: [],
      },
    }));
  }

  formatToolResponse(result: any): any {
    const textJSON = JSON.stringify({
      content: result.content,
      structuredContent: result.structuredContent ?? {},
    });
    return { role: "tool", content: textJSON };
  }

  formatImageData(data: string, mime: string = "image/png"): string {
    if (data.startsWith("http://") || data.startsWith("https://")) return data;
    if (data.startsWith("data:")) return data;
    return `data:${mime};base64,${data}`;
  }

  /* Message-level conversions */
  formatResponseToIntermediateRequestMessage(response: any): GenericMessage {
    const text = response?.final || response?.text || "";
    return {
      id: randomUUID(),
      timestamp: Date.now(),
      role: RoleType.USER,
      type: MessageType.INTERMEDIATE_REQUEST,
      content: [{ type: ContentType.TEXT, text }],
    } as any;
  }

  /* Context management */
  createMessageContext(): any[] {
    return [];
  }

  addToApiMessageContext(response: any, context: any[]): void {
    const text = response?.final || response?.text || "";
    if (text) {
      context.push({ role: "assistant", content: text });
    }
  }

  addToFormattedMessageContext(response: any, context: GenericMessage[]): void {
    const textContent = response?.final || response?.text || "";
    context.push({
      id: randomUUID(),
      timestamp: Date.now(),
      type: MessageType.AGENT_REQUEST,
      role: RoleType.ASSISTANT,
      content: [{ type: ContentType.TEXT, text: textContent }],
      calls: this.formatCallToolRequest(response),
    } as AgentRequestMessage);
  }

  /* Billing helper */
  getCostFromResponse(_response: any): number {
    return 0;
  }

  /* Internal helpers */
  private formatApiMessages(messages: any[]): APIMessages {
    // Keep only the most recent N messages to avoid oversized payloads
    const src = Array.isArray(messages)
      ? messages.slice(-this.maxHistoryMessages)
      : [];
    const out: APIMessages = [];
    src.forEach((m: any) => {
      const role = (m.role as string) || "user";
      const content = m.content;

      // 0) If already in API schema, pass through as-is
      if (
        typeof role === "string" &&
        (typeof content === "string" ||
          (Array.isArray(content) &&
            content.every((it: any) =>
              it && typeof it === "object" &&
              typeof it.type === "string" &&
              ("text" in it || "image" in it)
            )))
      ) {
        out.push({ role: role as any, content } as any);
        return;
      }
      // If content is an array of typed items
      if (Array.isArray(content)) {
        const parts: any[] = [];
        content.forEach((item: any) => {
          if (item.type === ContentType.TEXT) {
            parts.push({ type: "text", text: item.text ?? "" });
          } else if (item.type === ContentType.IMAGE) {
            // Support both GenericMessage IMAGE (data/mimeType) and API-style (image)
            const already = (item as any).image as string | undefined;
            const dataStr = (item as any).data as string | undefined;
            const mime = (item as any).mimeType as string | undefined;
            const imageVal = already
              ? already
              : dataStr
              ? this.formatImageData(dataStr, mime)
              : "";
            if (imageVal) {
              parts.push({ type: "image", image: imageVal });
            }
          }
        });
        if (parts.length) {
          out.push({ role: "user", content: parts });
          return;
        }
      }

      // Otherwise assume plain text content
      const text = Array.isArray(content)
        ? content.map((c: any) => c.text).filter(Boolean).join("\n")
        : typeof content === "string"
        ? content
        : "";
      out.push({ role: role as any, content: text || "" });
    });
    return out;
  }

  private async postChat(payload: any): Promise<APIResponse> {
    const url = `${this.baseUrl}/chat`;
    const attempt = async (): Promise<APIResponse> => {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), this.requestTimeoutMs);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status} ${res.statusText} ${text}`);
        }
        return (await res.json()) as APIResponse;
      } finally {
        clearTimeout(t);
      }
    };

    // simple retries with backoff
    const maxRetries = 2;
    let lastErr: unknown;
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await attempt();
      } catch (err) {
        lastErr = err;
        if (i < maxRetries) {
          const backoffMs = 500 * Math.pow(2, i);
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
      }
    }
    throw new Error(`QwenLocal fetch failed: ${String(lastErr)}`);
  }
}


