import {
  GoogleGenAI,
  FunctionCallingConfigMode,
  FunctionDeclaration,
  ContentListUnion,
  GenerateContentResponse,
  Schema,
} from "@google/genai";
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
import { randomUUID } from "crypto";
import { logger } from "../utils/helpers";

export class GoogleModel extends ModelInstance {
  private client: GoogleGenAI;

  constructor(config: ModelConfig) {
    super(config);
    this.client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
  }
  formatImageData(imageData: string, mimeType?: string): string {
    throw new Error("Method not implemented.");
  }

  /**
   * Generic content generation without tools.
   */
  async generateResponse(
    input: ContentListUnion,
    options: Partial<{
      systemInstruction: any; // Gemini Content
    }> = {}
  ): Promise<GenerateContentResponse> {
    return await this.client.models.generateContent({
      model: this.modelName,
      contents: input,
      config: {
        temperature: this.temperature,
        maxOutputTokens: this.maxTokens,
        ...(options.systemInstruction
          ? { systemInstruction: options.systemInstruction }
          : {}),
      },
    });
  }

  async generateResponseWithTool(
    input: ContentListUnion,
    tools: FunctionDeclaration[],
    options: Partial<{
      functionCallingMode: FunctionCallingConfigMode;
      allowedFunctionNames: string[];
      systemInstruction: any;
    }> = {}
  ): Promise<GenerateContentResponse> {
    const mode = options.functionCallingMode ?? FunctionCallingConfigMode.AUTO;

    return await this.client.models.generateContent({
      model: this.modelName,
      contents: input,
      config: {
        temperature: this.temperature,
        maxOutputTokens: this.maxTokens,
        tools: [
          {
            functionDeclarations: tools,
          },
        ],
        toolConfig: {
          functionCallingConfig: {
            mode,
            ...(options.allowedFunctionNames
              ? { allowedFunctionNames: options.allowedFunctionNames }
              : {}),
          },
        },
        // [DEBUG] Enable this to see internal thoughts
        // thinkingConfig: {
        //   includeThoughts: true,
        // },
        ...(options.systemInstruction
          ? { systemInstruction: options.systemInstruction }
          : {}),
      },
    });
  }

  /* ---------------------------------------------------------------------- */
  /*  Formatting helpers                                                    */
  /* ---------------------------------------------------------------------- */

  formatRequest(messages: GenericMessage[]): ContentListUnion[] {
    if (!messages?.length) {
      throw new Error("No messages provided");
    }

    return messages.map((msg) => {
      // Gemini uses roles "user" and "model".  We map everything else to user.
      const role = msg.role === RoleType.ASSISTANT ? "model" : "user";

      const parts = msg.content.map((item) => {
        switch (item.type) {
          case ContentType.TEXT:
            return { text: item.text };
          case ContentType.IMAGE:
            return {
              inlineData: {
                mimeType: item.mimeType ?? "image/png",
                data: this.stripDataUrl(item.data),
              },
            };
          case ContentType.AUDIO:
            return {
              inlineData: {
                mimeType: item.mimeType ?? "audio/wav",
                data: this.stripDataUrl(item.data),
              },
            };
          default:
            throw new Error(`Unsupported content type: ${item.type}`);
        }
      });

      return { role, parts };
    });
  }

  /**
   * Extract function-call requests from a Gemini response.
   */
  formatCallToolRequest(
    response: GenerateContentResponse
  ): CallToolRequestParams[] {
    if (!response.functionCalls?.length) return [];
    return response.functionCalls.map((call) => {
      const uuid = randomUUID();
      return {
        id: call.id ?? `${call.name ?? "tool_call"}` + `-${uuid}`,
        call_id: uuid,
        name: call.name ?? uuid,
        arguments: call.args ?? {},
      };
    });
  }

  formatToolResponse(result: CallToolResult): ContentListUnion {
    // [TODO] Identify the error case
    if (!result.name || typeof result.name !== "string") {
      logger.error({
        header: "Error Detected: Missing tool name in response",
        body: `Result: ${JSON.stringify(result, null, 2)}`,
      });
    }

    return {
      role: "user",
      parts: [
        {
          functionResponse: {
            name:
              typeof result.name === "string" ? result.name : "unknown_tool",
            response: {
              output: {
                content: result.content,
                structuredContent: result.structuredContent ?? {},
              },
            },
          },
        },
      ],
    };
  }

  /**
   * MCP tool list -> Gemini FunctionDeclarations
   */
  formatToolList(
    tools: Awaited<ReturnType<Client["listTools"]>>["tools"]
  ): FunctionDeclaration[] {
    const toolList: FunctionDeclaration[] = [];
    tools.forEach((tool) => {
      toolList.push({
        name: tool.name,
        description: tool.description ?? "",
        parameters: tool.inputSchema as Record<string, Schema>,
      });
    });
    return toolList;
  }

  /* ---------------------------------------------------------------------- */
  /*  Message-level helpers                                                 */
  /* ---------------------------------------------------------------------- */

  formatResponseToAgentRequestMessage(response: any): GenericMessage {
    const text = response.text ?? ""; // Convenience accessor in SDK
    const calls = this.formatCallToolRequest(response);

    return {
      id: response.responseId ?? "",
      timestamp: Date.now(),
      type: MessageType.AGENT_REQUEST,
      role: RoleType.ASSISTANT,
      content: [{ type: ContentType.TEXT, text }],
      calls,
    } as AgentRequestMessage;
  }

  formatResponseToIntermediateRequestMessage(response: any): GenericMessage {
    const text = response.text ?? "";
    return {
      id: response.responseId ?? "",
      timestamp: Date.now(),
      type: MessageType.INTERMEDIATE_REQUEST,
      role: RoleType.USER,
      content: [{ type: ContentType.TEXT, text }],
    } as IntermediateRequestMessage;
  }

  /* ---------------------------------------------------------------------- */
  /*  Context helpers                                                       */
  /* ---------------------------------------------------------------------- */

  createMessageContext(): ContentListUnion[] {
    return [];
  }

  addToApiMessageContext(
    response: GenerateContentResponse,
    context: ContentListUnion[]
  ): void {
    // Push the *model* turn (Gemini auto-lifts first candidate).
    if (response.candidates![0].finishReason === "MALFORMED_FUNCTION_CALL") {
      logger.error({
        header: "Malformed function call detected in Gemini response",
      });
    }

    if (response.candidates?.[0]?.content) {
      // [DEBUG] For internal thought debugging
      // response.candidates?.[0]?.content.parts!.forEach((part) => {
      //   if (part.text) {
      //     logger.debug({
      //       header: "Model internal thoughts",
      //       body: part.text,
      //     });
      //   }
      // });

      context.push({
        role: "model",
        parts: response.candidates[0].content.parts,
      });
    }
  }

  addToFormattedMessageContext(
    response: GenerateContentResponse,
    context: GenericMessage[]
  ): void {
    context.push(this.formatResponseToAgentRequestMessage(response));
  }

  /* ---------------------------------------------------------------------- */
  /*  Billing helper                                                        */
  /* ---------------------------------------------------------------------- */

  getCostFromResponse(response: GenerateContentResponse): number {
    if (!response.usageMetadata) {
      throw new Error("Response does not contain usage metadata");
    }

    const usage = response.usageMetadata;
    const inTokens = usage.promptTokenCount ?? 0;
    const outTokens = usage.candidatesTokenCount ?? 0;
    const thoughtsTokens = usage.thoughtsTokenCount ?? 0;

    return (
      inTokens * this.inputCost +
      outTokens * this.outputCost +
      thoughtsTokens * this.outputCost
    );
  }

  /* ---------------------------------------------------------------------- */
  /*  Utility                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * Remove a data-URL prefix (`data:<mime>;base64,`) if present.
   */
  private stripDataUrl(data: string): string {
    return data.replace(/^data:[^;]+;base64,/, "");
  }
}
