import {
  UIstate,
  updateConnectionStatus,
  updateChannelSelectUI,
  addLogEntry,
  channelSelect,
} from './ui.js';
import { ProgressData } from './types.js';
import { generateId } from './utils.js';
import { InternalFigmaMessageType } from '../types.js';

// Type definitions to match socket server
enum MessageSource {
  SOCKET_SERVER = 'socket_server',
  MCP_SERVER = 'mcp_server',
  FIGMA_CLIENT = 'figma_client',
  UNKNOWN = 'unknown',
}

enum MessageType {
  GET_CHANNELS = 'get_channels',
  JOIN = 'join',
  MESSAGE = 'message',
  NOTIFY = 'notify',
  TRANSMIT = 'transmit',
  JOIN_RESULT = 'join_result',
  ERROR = 'error',
  CONNECTION = 'connection',
}

interface Message {
  source: MessageSource;
  type: MessageType;
  payload?: any;
}

/* ---------- WebSocket Lifecycle ---------- */
export async function connectToServer(port: number): Promise<void> {
  if (UIstate.connected && UIstate.socket) {
    updateConnectionStatus(true, 'Already connected to server');
    return;
  }

  UIstate.serverPort = port;
  const socket = new WebSocket(`ws://localhost:${port}`);
  UIstate.socket = socket;

  socket.onopen = () => {
    UIstate.connected = true;
    updateConnectionStatus(
      true,
      `Connected to server on port ${port}. Fetching channels…`
    );
    requestAvailableChannels();
  };

  socket.onmessage = (event: MessageEvent<string>) => {
    try {
      const message = JSON.parse(event.data) as Message;
      /* Handle different message types */
      switch (message.type) {
        case MessageType.CONNECTION:
          updateConnectionStatus(true, `Connected to server on port ${port}`);
          parent.postMessage(
            {
              pluginMessage: {
                type: InternalFigmaMessageType.NOTIFY,
                message: `Connected to server on port ${port}`,
              },
            },
            '*'
          );
          break;

        case MessageType.GET_CHANNELS:
          handleChannelList(message.payload?.channels as string[]);
          break;

        case MessageType.JOIN_RESULT:
          handleJoinResult(message.payload);
          break;

        case MessageType.ERROR:
          console.error('Error:', message.payload?.message);
          updateConnectionStatus(false, `Error: ${message.payload?.message}`);
          break;

        case MessageType.NOTIFY:
          if (
            UIstate.joinedChannel &&
            message.payload?.channel &&
            message.payload.channel !== UIstate.currentChannel
          ) {
            return;
          }
          addLogEntry({
            timestamp: new Date().toISOString(),
            direction: 'system',
            type: 'notification',
            data: message.payload?.message || 'System notification',
          });
          break;

        case MessageType.TRANSMIT:
          if (
            UIstate.joinedChannel &&
            message.payload?.channel &&
            message.payload.channel !== UIstate.currentChannel
          ) {
            return;
          }
          handleSocketMessage(message.payload);
          break;

        default:
          console.warn('Unknown message type:', message.type);
      }

      /* Log the message */
      addLogEntry({
        timestamp: new Date().toISOString(),
        direction: 'incoming',
        type: 'websocket',
        data: message,
      });
    } catch (err) {
      console.error('Error parsing message:', err);
    }
  };

  socket.onclose = () => {
    UIstate.connected = false;
    UIstate.socket = null;
    UIstate.joinedChannel = false;
    UIstate.currentChannel = null;
    updateConnectionStatus(false, 'Disconnected from server');
    updateChannelSelectUI(false);
  };

  socket.onerror = (err) => {
    console.error('WebSocket error:', err);
    UIstate.connected = false;
    UIstate.socket = null;
    UIstate.joinedChannel = false;
    UIstate.currentChannel = null;
    updateConnectionStatus(false, 'Connection error');
    updateChannelSelectUI(false);
  };
}

export function disconnectFromServer(): void {
  if (UIstate.socket) {
    UIstate.socket.close();
    UIstate.socket = null;
  }
  UIstate.connected = false;
  updateConnectionStatus(false, 'Disconnected from server');
}

function requestAvailableChannels(): void {
  if (!UIstate.socket || !UIstate.connected) {
    console.error('Cannot request channels: socket not connected');
    return;
  }

  const message: Message = {
    source: MessageSource.FIGMA_CLIENT,
    type: MessageType.GET_CHANNELS,
    payload: {
      id: generateId(),
    },
  };

  UIstate.socket.send(JSON.stringify(message));
}

function handleChannelList(channels: string[]): void {
  if (!Array.isArray(channels) || channels.length === 0) {
    addLogEntry({
      timestamp: new Date().toISOString(),
      direction: 'system',
      type: 'warning',
      data: 'No channels available from server',
    });
    return;
  }

  UIstate.channels = channels;
  updateChannelSelectUI(true);

  UIstate.currentChannel = channels[0];
  channelSelect.value = channels[0];
  joinChannel();
}

function handleJoinResult(payload: any): void {
  if (payload?.success) {
    UIstate.joinedChannel = true;
    updateConnectionStatus(
      true,
      `Connected on port ${UIstate.serverPort}, joined channel: ${UIstate.currentChannel}`
    );
    addLogEntry({
      timestamp: new Date().toISOString(),
      direction: 'system',
      type: 'channel',
      data: `Successfully joined channel: ${UIstate.currentChannel}`,
    });
  } else {
    addLogEntry({
      timestamp: new Date().toISOString(),
      direction: 'system',
      type: 'error',
      data: `Failed to join channel: ${payload?.error ?? 'Unknown error'}`,
    });
  }
}

export function joinChannel(): void {
  if (!UIstate.socket || !UIstate.connected) {
    console.error('Cannot join channel: socket not connected');
    return;
  }

  const channel = channelSelect.value;
  if (!channel) {
    console.error('No channel selected');
    return;
  }

  UIstate.currentChannel = channel;

  const message: Message = {
    source: MessageSource.FIGMA_CLIENT,
    type: MessageType.JOIN,
    payload: {
      channel: UIstate.currentChannel,
      clientType: MessageSource.FIGMA_CLIENT,
    },
  };

  UIstate.socket.send(JSON.stringify(message));

  updateConnectionStatus(
    true,
    `Connected to server, joining channel: ${UIstate.currentChannel}…`
  );
}

export async function sendCommand(
  command: string,
  params?: unknown
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!UIstate.connected || !UIstate.socket) {
      reject(new Error('Not connected to server'));
      return;
    }
    if (!UIstate.joinedChannel) {
      reject(new Error('Not joined to any channel'));
      return;
    }

    const id = generateId();
    UIstate.pendingRequests.set(id, { resolve, reject });

    const message: Message = {
      source: MessageSource.FIGMA_CLIENT,
      type: MessageType.MESSAGE,
      payload: {
        channel: UIstate.currentChannel,
        message: { id, command, params, channel: UIstate.currentChannel },
      },
    };

    UIstate.socket.send(JSON.stringify(message));

    /* timeout fallback */
    setTimeout(() => {
      if (UIstate.pendingRequests.has(id)) {
        UIstate.pendingRequests.delete(id);
        reject(new Error('Request timed out'));
      }
    }, 30_000);
  });
}

export function sendSuccessResponse(id: string, result: unknown): void {
  if (!UIstate.socket || !UIstate.connected) {
    console.error('Cannot send response: socket not connected');
    return;
  }

  const message: Message = {
    source: MessageSource.FIGMA_CLIENT,
    type: MessageType.MESSAGE,
    payload: {
      channel: UIstate.currentChannel,
      message: { id, result },
    },
  };

  UIstate.socket.send(JSON.stringify(message));
}

export function sendErrorResponse(id: string, errorMessage: string): void {
  if (!UIstate.socket || !UIstate.connected) {
    console.error('Cannot send error response: socket not connected');
    return;
  }

  const message: Message = {
    source: MessageSource.FIGMA_CLIENT,
    type: MessageType.MESSAGE,
    payload: {
      channel: UIstate.currentChannel,
      message: { id, error: errorMessage },
    },
  };

  UIstate.socket.send(JSON.stringify(message));
}

async function handleSocketMessage(payload: any): Promise<void> {
  const data = payload.message;
  if (data?.id && UIstate.pendingRequests.has(data.id)) {
    const { resolve, reject } = UIstate.pendingRequests.get(data.id)!;
    UIstate.pendingRequests.delete(data.id);
    data.error ? reject(new Error(data.error)) : resolve(data.result);
    return;
  }

  if (data?.command) {
    try {
      parent.postMessage(
        {
          pluginMessage: {
            type: InternalFigmaMessageType.EXECUTE_COMMAND,
            id: data.id,
            command: data.command,
            params: data.params,
          },
        },
        '*'
      );
    } catch (err) {
      sendErrorResponse(
        data.id,
        (err as Error).message ?? 'Error executing command'
      );
    }
  }
}

export function sendProgressUpdateToServer(progressData: ProgressData): void {
  if (!UIstate.socket || !UIstate.connected) {
    console.error('Cannot send progress update: socket not connected');
    return;
  }

  const message: Message = {
    source: MessageSource.FIGMA_CLIENT,
    type: MessageType.MESSAGE,
    payload: {
      channel: UIstate.currentChannel,
      message: {
        id: progressData.commandId,
        type: 'progress_update',
        data: progressData,
      },
    },
  };

  UIstate.socket.send(JSON.stringify(message));
}
