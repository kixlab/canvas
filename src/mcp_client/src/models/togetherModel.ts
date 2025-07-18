/**********************************************************************
 * llamaModel.ts
 *
 * Together-AI implementation of ModelInstance for Meta-Llama models.
 * --------------------------------------------------------------------
 *  ❗ Notes / gaps
 *  –  Together’s SDK does **not** yet expose audio-or-image helpers
 *     for chat models → image/audio branches are left as TODOs.
 *  –  The SDK does not return token-level logprobs via the TypeScript
 *     client (only in raw JSON) so `getCostFromResponse` ignores them.
 *  –  Streaming support is omitted for brevity; add `stream:true`
 *     where needed and handle the AsyncIterable if your agent streams.
 *********************************************************************/

import Together from "together-ai";
import { randomUUID } from "crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";

import {
  ModelConfig,
  CallToolRequestParams,
  GenericMessage,
  ContentType,
  AgentRequestMessage,
  IntermediateRequestMessage,
  RoleType,
  MessageType,
} from "../types";

import { ModelInstance } from "./baseModel";
import {
  ChatCompletion,
  CompletionCreateParams,
} from "together-ai/resources/chat/completions";

type TogetherMessage =
  | CompletionCreateParams.ChatCompletionSystemMessageParam
  | CompletionCreateParams.ChatCompletionUserMessageParam
  | CompletionCreateParams.ChatCompletionAssistantMessageParam
  | CompletionCreateParams.ChatCompletionToolMessageParam;

export class TogetherModel extends ModelInstance {
  private client: Together;

  constructor(config: ModelConfig) {
    super(config);
    this.client = new Together({
      apiKey: process.env.TOGETHER_API_KEY,
    });
  }

  /* ──────────────────────────────────────────────────────────── */
  /* Core generation helpers                                      */
  /* ──────────────────────────────────────────────────────────── */

  async generateResponse(
    messages: TogetherMessage[],
    options: Partial<Together.Chat.CompletionCreateParams> = {}
  ): Promise<ChatCompletion> {
    return await this.client.chat.completions.create({
      model: this.modelName,
      messages,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      ...options,
      stream: false,
    });
  }

  async generateResponseWithTool(
    messages: TogetherMessage[],
    tools: Together.Chat.CompletionCreateParams["tools"],
    options: Partial<Together.Chat.CompletionCreateParams> = {}
  ): Promise<ChatCompletion> {
    return await this.client.chat.completions.create({
      model: this.modelName,
      messages,
      tools,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      ...options,
      stream: false,
    });
  }

  /* ──────────────────────────────────────────────────────────── */
  /* Formatting helpers                                           */
  /* ──────────────────────────────────────────────────────────── */

  /** Convert GenericMessage[] → Together message array */
  formatRequest(messages: GenericMessage[]): TogetherMessage[] {
    if (!messages?.length) throw new Error("No messages provided");
    const requestMessages: TogetherMessage[] = [];

    const roleMap: Record<RoleType, string> = {
      [RoleType.SYSTEM]: "system",
      [RoleType.USER]: "user",
      [RoleType.ASSISTANT]: "assistant",
      [RoleType.TOOL]: "tool",
    };

    messages.forEach((message) => {
      const role = roleMap[message.role] ?? "user";
      const content = message.content.map((item) => {
        switch (item.type) {
          case ContentType.TEXT:
            return { type: "text", text: item.text ?? "" };

          case ContentType.IMAGE:
            return {
              type: "image_url",
              image_url: {
                url: this.formatImageData(item.data, item.mimeType),
              },
            };

          case ContentType.AUDIO:
            return {
              type: "text",
              text: "[Audio omitted – model does not support AUDIO input]",
            };

          default:
            return { type: "text", text: "" };
        }
      });
      requestMessages.push({
        role,
        content,
      } as TogetherMessage);
    });
    return requestMessages;
  }

  /** Extract function-call requests from Together response */
  // TODO
  formatCallToolRequest(response: ChatCompletion): CallToolRequestParams[] {
    const toolCalls = response.choices?.[0]?.message?.tool_calls ?? [];
    if (!Array.isArray(toolCalls)) return [];

    return toolCalls.map((tc) => ({
      id: tc.id ?? randomUUID(),
      call_id: tc.id ?? randomUUID(),
      name: tc.function?.name,
      arguments: (() => {
        try {
          return JSON.parse(tc.function?.arguments ?? "{}");
        } catch {
          return {};
        }
      })(),
    }));
  }

  /** MCP Tool[] → Together.tools */
  formatToolList(
    tools: Awaited<ReturnType<Client["listTools"]>>["tools"]
  ): NonNullable<Together.Chat.CompletionCreateParams["tools"]> {
    return (
      tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description ?? "",
          parameters: tool.inputSchema ?? {
            type: "object",
            properties: {},
            required: [],
          },
        },
      })) || []
    );
  }

  /** CallToolResult → Together “tool” message  */
  formatToolResponse(
    result: CallToolResult
  ): CompletionCreateParams.ChatCompletionToolMessageParam {
    const textJSON = JSON.stringify({
      content: result.content,
      structuredContent: result.structuredContent ?? {},
    });

    return {
      role: "tool",
      tool_call_id: (result.call_id as string) ?? result.id ?? randomUUID(),
      content: textJSON,
    };
  }

  formatImageData(data: string, mime: string = "image/png"): string {
    if (data.startsWith("http://") || data.startsWith("https://")) return data;
    if (data.startsWith("data:")) return data; // already a data-URL
    return `data:${mime};base64,${data}`;
  }

  /* ──────────────────────────────────────────────────────────── */
  /* Message-level conversions                                    */
  /* ──────────────────────────────────────────────────────────── */

  formatResponseToIntermediateRequestMessage(
    response: ChatCompletion
  ): GenericMessage {
    const assistantMsg = response.choices?.[0]?.message;
    const text = assistantMsg?.content ?? "";

    return {
      id: response.id,
      timestamp: response.created,
      role: RoleType.USER,
      type: MessageType.INTERMEDIATE_REQUEST,
      content: [{ type: ContentType.TEXT, text }],
    } as IntermediateRequestMessage;
  }

  /* ──────────────────────────────────────────────────────────── */
  /* Context management                                           */
  /* ──────────────────────────────────────────────────────────── */

  createMessageContext(): TogetherMessage[] {
    return [];
  }

  addToApiMessageContext(
    response: ChatCompletion,
    context: TogetherMessage[]
  ): void {
    if (response.choices?.[0]?.message) {
      context.push(response.choices[0].message);
    }
  }

  addToFormattedMessageContext(
    response: ChatCompletion,
    context: GenericMessage[]
  ): void {
    if (!response.choices?.length) {
      throw new Error("No choices in response");
    }

    const textContent = response.choices[0].message!.content;

    context.push({
      id: response.id,
      timestamp: response.created,
      type: MessageType.AGENT_REQUEST,
      role: RoleType.ASSISTANT,
      content: [{ type: ContentType.TEXT, text: textContent }],
      calls: this.formatCallToolRequest(response),
    } as AgentRequestMessage);
  }

  /* ──────────────────────────────────────────────────────────── */
  /* Billing helper                                               */
  /* ──────────────────────────────────────────────────────────── */

  getCostFromResponse(response: ChatCompletion): number {
    const usage = response.usage;
    if (!usage) throw new Error("No usage data in Together response");

    const inTokens = usage.prompt_tokens ?? 0;
    const outTokens = usage.completion_tokens ?? 0;

    return inTokens * this.inputCost + outTokens * this.outputCost;
  }
}
