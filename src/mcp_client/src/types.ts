import { Request } from "express";
import {
  TextContent,
  ImageContent,
  AudioContent,
  EmbeddedResource,
  CallToolRequest,
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

export enum MessageType {
  SYSTEM = "system",
  USER_REQUEST = "user_request",
  USER_FEEDBACK = "user_feedback",
  INTERMEDIATE_REQUEST = "intermediate_request",
  AGENT_COMPLETION = "agent_completion",
  AGENT_REQUEST = "agent_request",
  TOOL_RESPONSE = "tool_response",
}

export enum RoleType {
  USER = "user",
  ASSISTANT = "assistant",
  SYSTEM = "system",
  TOOL = "tool",
}

export enum ContentType {
  TEXT = "text",
  IMAGE = "image",
  AUDIO = "audio",
  RESOURCE = "resource",
}

export interface BaseMessage {
  id: string;
  timestamp: number;
  role: RoleType;
  type: MessageType;
  content: (TextContent | ImageContent | AudioContent | EmbeddedResource)[];
}

export interface SystemMessage extends BaseMessage {
  role: RoleType.SYSTEM;
  type: MessageType.SYSTEM;
}

export interface UserRequestMessage extends BaseMessage {
  role: RoleType.USER;
  type: MessageType.USER_REQUEST;
}

export interface UserFeedbackMessage extends BaseMessage {
  role: RoleType.USER;
  type: MessageType.USER_FEEDBACK;
}

export interface AgentCompletionMessage extends BaseMessage {
  role: RoleType.ASSISTANT;
  type: MessageType.AGENT_COMPLETION;
  step_count: number;
}

export interface AgentRequestMessage extends BaseMessage {
  role: RoleType.ASSISTANT;
  type: MessageType.AGENT_REQUEST;
  calls: CallToolRequestParams[];
}

export interface IntermediateRequestMessage extends BaseMessage {
  role: RoleType.USER;
  type: MessageType.INTERMEDIATE_REQUEST;
}

export interface ToolResponseMessage extends BaseMessage {
  role: RoleType.TOOL;
  type: MessageType.TOOL_RESPONSE;
  results: CallToolResult[];
}

export type GenericMessage =
  | SystemMessage
  | UserRequestMessage
  | UserFeedbackMessage
  | AgentCompletionMessage
  | AgentRequestMessage
  | ToolResponseMessage
  | IntermediateRequestMessage;

export enum ToolResponseFormat {
  TEXT = "text",
  IMAGE = "image",
  AUDIO = "audio",
  RESOURCE = "resource",
}

export type CallToolRequestParams = CallToolRequest["params"];
// id: string;
// arguments: Record<string, any>

export interface ModelConfig {
  name: string;
  provider: ModelProvider;
  input_cost: number;
  output_cost: number;
  temperature?: number;
  max_tokens?: number;
}

export enum AgentType {
  REACT = "react",
  VISUAL = "visual",
  FEEDBACK = "feedback",
}

export interface ServerConfig {
  models: ModelConfig[];
  agent_type: AgentType;
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

export enum ResponseStatus {
  SUCCESS = "success",
  ERROR = "error",
}

export interface ResponseData {
  status: ResponseStatus;
  message?: string;
  error?: string;
  payload?: Object;
}
export type ToolList = Awaited<ReturnType<Client["listTools"]>>;

export type ToolItem = ToolList["tools"][number];
