/* ---------- Types and Interfaces ---------- */

export type Direction = 'incoming' | 'outgoing' | 'system';
export type ProgressStatus = 'started' | 'in_progress' | 'completed' | 'error';

export interface LogEntry {
  timestamp: string; // ISO string
  direction: Direction;
  type: string; // "websocket", "error", …
  data: unknown; // arbitrary payload
}

export interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

export interface ProgressData {
  commandId: string;
  progress?: number;
  message?: string;
  status: ProgressStatus;
}

export interface UIState {
  connected: boolean;
  socket: WebSocket | null;
  serverPort: number;
  pendingRequests: Map<string, PendingRequest>;
  logs: LogEntry[];
  maxLogs: number;
  channels: string[];
  currentChannel: string | null;
  joinedChannel: boolean;
}
