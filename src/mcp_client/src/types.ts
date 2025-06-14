import { Request } from "express";

// Core types for the MCP client
export interface ChatRequest {
  message: string;
}

export interface AgentInput {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
    detail: string;
  };
}

export interface AgentResponse {
  response: string;
  json_response?: any;
  step_count: number;
  messages?: any[];
}

// [TODO] Refine the type for tool call results
export interface ToolCallResult {
  status: "success" | "error";
  content: [
    {
      type: string;
      [key: string]: string;
    }
  ];
}

export interface ModelConfig {
  name: string;
  provider: string;
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
