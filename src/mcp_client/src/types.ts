import { Request } from "express";

// Core types for the MCP client
export interface ChatRequest {
  message: string;
}

export interface MessageItem {
  type: "text" | "image_url";
  content: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  items: MessageItem[];
}

export interface AgentResponse {
  response: string;
  step_count: number;
  messages?: any[];
}

// [TODO] Refine the type for tool call results
export interface ToolCallResult {
  status: "success" | "error";
  id: string;
  call_id?: string; // call_id for OpenAI
  content: [
    {
      type: string;
      [key: string]: string;
    }
  ];
}

export interface ToolCall {
  id: string;
  name: string;
  call_id?: string; // call_id for OpenAI
  arguments?: Record<string, unknown>;
}

export interface ModelConfig {
  name: string;
  provider: ModelProvider;
  temperature?: number;
  max_tokens?: number;
}

export interface ServerConfig {
  models: ModelConfig[];
  agent_type: string;
}

export interface AgentMetadata {
  input_id: string;
}

// Extend Express Request type to include file property from multer
export interface MulterRequest extends Request {
  file?: Express.Multer.File;
  files?:
    | Express.Multer.File[]
    | { [fieldname: string]: Express.Multer.File[] };
}

export enum ModelProvider {
  OPENAI = "openai",
  ANTHROPIC = "anthropic",
  GOOGLE = "google",
  OLLAMA = "ollama",
}
