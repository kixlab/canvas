import {
  TextContent,
  ImageContent,
  AudioContent,
  EmbeddedResource,
} from "@modelcontextprotocol/sdk/types.js";

// Type definitions and interfaces for the MCP server

export interface FigmaResponse {
  id: string;
  result?: any;
  error?: string;
}

export type ResponseContent =
  | TextContent
  | ImageContent
  | AudioContent
  | EmbeddedResource;

export interface CommandProgressUpdate {
  type: "command-progress";
  commandId: string;
  commandType: string;
  status: "started" | "in_progress" | "completed" | "error";
  progress: number;
  totalItems: number;
  processedItems: number;
  currentChunk?: number;
  totalChunks?: number;
  chunkSize?: number;
  message: string;
  payload?: any;
  timestamp: number;
}

export interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
  lastActivity: number;
}

export interface AnnotationResult {
  success: boolean;
  nodeId: string;
  annotationsApplied?: number;
  annotationsFailed?: number;
  totalAnnotations?: number;
  completedInChunks?: number;
  results?: Array<{
    success: boolean;
    nodeId: string;
    error?: string;
    annotationId?: string;
  }>;
}

export interface TextChangeResult {
  success: boolean;
  changesApplied?: number;
  changesFailed?: number;
  totalChanges?: number;
  completedInChunks?: number;
  results?: Array<{
    success: boolean;
    nodeId: string;
    error?: string;
    originalText?: string;
    translatedText?: string;
  }>;
}

export interface ProgressMessage {
  message?: FigmaResponse | any;
  type?: string;
  id?: string;
  channels?: string[];
  success?: boolean;
  channel?: string;
  error?: string;
  [key: string]: any;
}

export interface SetMultipleAnnotationsParams {
  nodeId: string;
  annotations: Array<{
    nodeId: string;
    labelMarkdown: string;
    categoryId?: string;
    annotationId?: string;
    properties?: Array<{ type: string }>;
  }>;
}

export type FigmaCommand =
  | "get_page_info"
  | "get_page_structure"
  | "get_selection_info"
  | "get_node_info"
  | "create_rectangle"
  | "create_frame"
  | "create_text"
  | "create_graphic"
  | "create_ellipse"
  | "create_polygon"
  | "create_star"
  | "create_line"
  | "move_node"
  | "resize_node"
  | "delete_node"
  | "get_styles"
  | "set_corner_radius"
  | "set_fill_color"
  | "set_opacity"
  | "set_stroke"
  | "set_fill_gradient"
  | "set_drop_shadow"
  | "set_inner_shadow"
  | "copy_style"
  | "clone_node"
  | "set_text_content"
  | "get_text_node_info"
  | "change_text_content"
  | "get_node_info_by_types"
  | "set_layout_mode"
  | "set_padding"
  | "set_axis_align"
  | "set_layout_sizing"
  | "set_item_spacing"
  | "check_connection_status"
  | "get_result_image";
