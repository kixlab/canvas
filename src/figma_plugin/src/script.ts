/* -------------------------------------------------------------
 * websocket-ui.ts        (compile with tsc --strict)
 * ------------------------------------------------------------- */

/* ---------- 1. Helper Types ---------- */

type Direction = 'incoming' | 'outgoing' | 'system';
type ProgressStatus = 'started' | 'in_progress' | 'completed' | 'error';

interface LogEntry {
  timestamp: string; // ISO string
  direction: Direction;
  type: string; // “websocket”, “error”, …
  data: unknown; // arbitrary payload
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

interface ProgressData {
  commandId: string;
  progress?: number;
  message?: string;
  status: ProgressStatus;
}

interface UIState {
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

/* ---------- 2. Application State ---------- */

const UIstate: UIState = {
  connected: false,
  socket: null,
  serverPort: 3055,
  pendingRequests: new Map(),
  logs: [],
  maxLogs: 500,
  channels: [],
  currentChannel: null,
  joinedChannel: false,
};

/* ---------- 3. DOM Elements ---------- */

const portInput = document.getElementById('port') as HTMLInputElement;
const connectButton = document.getElementById(
  'btn-connect'
) as HTMLButtonElement;
const disconnectButton = document.getElementById(
  'btn-disconnect'
) as HTMLButtonElement;
const connectionStatus = document.getElementById(
  'connection-status'
) as HTMLElement;
const logPanel = document.getElementById('log-panel') as HTMLElement;
const logPanelTab = document.getElementById('log-panel-tab') as HTMLElement;
const btnClearLogs = document.getElementById(
  'btn-clear-logs'
) as HTMLButtonElement;
const btnClearLogsTab = document.getElementById(
  'btn-clear-logs-tab'
) as HTMLButtonElement;
const channelSelect = document.getElementById(
  'channel-select'
) as HTMLSelectElement;

/* Tabs */
const tabs = document.querySelectorAll<HTMLButtonElement>('.tab');
const tabContents = document.querySelectorAll<HTMLElement>('.tab-content');

/* Progress elements */
const progressContainer = document.getElementById(
  'progress-container'
) as HTMLElement;
const progressBar = document.getElementById('progress-bar') as HTMLElement;
const progressMessage = document.getElementById(
  'progress-message'
) as HTMLElement;
const progressStatus = document.getElementById(
  'progress-status'
) as HTMLElement;
const progressPercentage = document.getElementById(
  'progress-percentage'
) as HTMLElement;

/* ---------- 4. UI State Helpers ---------- */

function updateConnectionStatus(isConnected: boolean, message?: string): void {
  UIstate.connected = isConnected;

  connectionStatus.textContent =
    message ??
    (isConnected ? 'Connected to server' : 'Not connected to server');
  connectionStatus.className = `status ${isConnected ? 'connected' : 'disconnected'}`;

  connectButton.disabled = isConnected;
  disconnectButton.disabled = !isConnected;
  portInput.disabled = isConnected;
}

/* ---------- 5. WebSocket Lifecycle ---------- */

async function connectToServer(port: number): Promise<void> {
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
      const data = JSON.parse(event.data) as any; // runtime payload
      console.log('Received message:', data);

      /* 1️⃣  Channel list */
      if (data.type === 'channels') {
        handleChannelList(data.channels as string[]);
        return;
      }

      /* Ignore messages from other channels when joined */
      if (
        UIstate.joinedChannel &&
        data.channel &&
        data.channel !== UIstate.currentChannel
      ) {
        console.log(`Ignoring message from different channel: ${data.channel}`);
        return;
      }

      /* 2️⃣  System / Error / Join results */
      if (data.type === 'system') {
        if (data.message?.result) {
          updateConnectionStatus(true, `Connected to server on port ${port}`);
          parent.postMessage(
            {
              pluginMessage: {
                type: 'notify',
                message: `Connected to server on port ${port}`,
              },
            },
            '*'
          );
        }
      } else if (data.type === 'error') {
        console.error('Error:', data.message);
        updateConnectionStatus(false, `Error: ${data.message}`);
        socket.close();
      } else if (data.type === 'join_result') {
        if (data.success) {
          UIstate.joinedChannel = true;
          updateConnectionStatus(
            true,
            `Connected on port ${port}, joined channel: ${UIstate.currentChannel}`
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
            data: `Failed to join channel: ${data.error ?? 'Unknown error'}`,
          });
        }
        return;
      }

      /* 3️⃣  Regular payload */
      handleSocketMessage(data);

      /* 4️⃣  Log it */
      addLogEntry({
        timestamp: new Date().toISOString(),
        direction: 'incoming',
        type: 'websocket',
        data,
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

function disconnectFromServer(): void {
  if (UIstate.socket) {
    UIstate.socket.close();
    UIstate.socket = null;
  }
  UIstate.connected = false;
  updateConnectionStatus(false, 'Disconnected from server');
}

/* ---------- 6. Channel Management ---------- */

function requestAvailableChannels(): void {
  if (!UIstate.socket || !UIstate.connected) {
    console.error('Cannot request channels: socket not connected');
    return;
  }
  UIstate.socket.send(
    JSON.stringify({ type: 'get_channels', id: generateId() })
  );
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

function updateChannelSelectUI(enabled: boolean): void {
  channelSelect.disabled = !enabled;

  if (enabled && UIstate.channels.length > 0) {
    channelSelect.innerHTML = '';
    UIstate.channels.forEach((ch) => {
      const opt = document.createElement('option');
      opt.value = ch;
      opt.textContent = ch;
      if (ch === UIstate.currentChannel) opt.selected = true;
      channelSelect.appendChild(opt);
    });
  } else {
    channelSelect.innerHTML = '<option value="">No channels available</option>';
  }
}

function joinChannel(): void {
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

  UIstate.socket.send(
    JSON.stringify({
      type: 'join',
      id: generateId(),
      channel: UIstate.currentChannel,
      clientType: 'figma_client',
    })
  );

  updateConnectionStatus(
    true,
    `Connected to server, joining channel: ${UIstate.currentChannel}…`
  );
}

/* ---------- 7. Logging ---------- */

function addLogEntry(entry: LogEntry): void {
  UIstate.logs.push(entry);
  if (UIstate.logs.length > UIstate.maxLogs) UIstate.logs.shift();

  const date = new Date(entry.timestamp);
  const timeString = date.toLocaleTimeString();

  const logEl = document.createElement('div');
  logEl.className = `log-entry ${entry.direction}`;

  const dirSpan = document.createElement('span');
  dirSpan.className = `log-direction ${entry.direction}`;
  dirSpan.textContent = entry.direction.substring(0, 3).toUpperCase();

  const timeSpan = document.createElement('span');
  timeSpan.className = 'timestamp';
  timeSpan.textContent = timeString;

  const contentSpan = document.createElement('div');
  contentSpan.innerHTML = `<strong>${entry.type}</strong>: ${formatLogData(entry.data)}`;

  logEl.append(dirSpan, ' ', timeSpan, ' - ', contentSpan);

  logPanel.appendChild(logEl);
  logPanelTab.appendChild(logEl.cloneNode(true));

  /* auto-scroll */
  logPanel.scrollTop = logPanel.scrollHeight;
  logPanelTab.scrollTop = logPanelTab.scrollHeight;
}

function formatLogData(data: unknown): string {
  if (data === undefined || data === null) return 'null';

  if (typeof data === 'object') {
    try {
      const simplified = simplifyObject(data, 2);
      return JSON.stringify(simplified, null, 2)
        .replace(/\n/g, '<br>')
        .replace(/ /g, '&nbsp;');
    } catch {
      return String(data);
    }
  }
  return String(data);
}

function simplifyObject(obj: unknown, maxDepth = 2, currentDepth = 0): unknown {
  if (currentDepth >= maxDepth) {
    if (Array.isArray(obj)) return `[Array(${obj.length})]`;
    if (typeof obj === 'object')
      return `{Object with ${Object.keys(obj ?? {}).length} properties}`;
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => simplifyObject(item, maxDepth, currentDepth + 1));
  }

  if (typeof obj === 'object' && obj !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = simplifyObject(v, maxDepth, currentDepth + 1);
    }
    return out;
  }
  return obj;
}

/* ---------- 8. Outbound Requests ---------- */

async function sendCommand(
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

    UIstate.socket.send(
      JSON.stringify({
        id,
        type: 'message',
        channel: UIstate.currentChannel,
        message: { id, command, params, channel: UIstate.currentChannel },
      })
    );

    /* timeout fallback */
    setTimeout(() => {
      if (UIstate.pendingRequests.has(id)) {
        UIstate.pendingRequests.delete(id);
        reject(new Error('Request timed out'));
      }
    }, 30_000);
  });
}

function sendSuccessResponse(id: string, result: unknown): void {
  if (!UIstate.socket || !UIstate.connected) {
    console.error('Cannot send response: socket not connected');
    return;
  }
  UIstate.socket.send(
    JSON.stringify({
      id,
      type: 'message',
      message: { id, result },
    })
  );
}

function sendErrorResponse(id: string, errorMessage: string): void {
  if (!UIstate.socket || !UIstate.connected) {
    console.error('Cannot send error response: socket not connected');
    return;
  }
  UIstate.socket.send(
    JSON.stringify({
      id,
      type: 'message',
      error: errorMessage,
    })
  );
}

/* ---------- 9. Inbound Message Dispatch ---------- */

async function handleSocketMessage(payload: any): Promise<void> {
  const data = payload.message;
  console.log('handleSocketMessage', data);

  /* --- resolve pending request ------------------------------------ */
  if (data?.id && UIstate.pendingRequests.has(data.id)) {
    const { resolve, reject } = UIstate.pendingRequests.get(data.id)!;
    UIstate.pendingRequests.delete(data.id);
    data.error ? reject(new Error(data.error)) : resolve(data.result);
    return;
  }

  /* --- command from server ---------------------------------------- */
  if (data?.command) {
    try {
      parent.postMessage(
        {
          pluginMessage: {
            type: 'execute-command',
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

/* ---------- 10. Progress tracking ---------- */

function updateProgressUI(progressData: ProgressData): void {
  progressContainer.classList.remove('hidden');

  const progress = progressData.progress ?? 0;
  progressBar.style.width = `${progress}%`;
  progressPercentage.textContent = `${progress}%`;
  progressMessage.textContent = progressData.message ?? 'Operation in progress';

  switch (progressData.status) {
    case 'started':
      progressStatus.textContent = 'Started';
      progressStatus.className = '';
      break;
    case 'in_progress':
      progressStatus.textContent = 'In Progress';
      progressStatus.className = '';
      break;
    case 'completed':
      progressStatus.textContent = 'Completed';
      progressStatus.className = 'operation-complete';
      setTimeout(() => progressContainer.classList.add('hidden'), 5_000);
      break;
    case 'error':
      progressStatus.textContent = 'Error';
      progressStatus.className = 'operation-error';
      break;
  }
}

function sendProgressUpdateToServer(progressData: ProgressData): void {
  if (!UIstate.socket || !UIstate.connected) {
    console.error('Cannot send progress update: socket not connected');
    return;
  }
  UIstate.socket.send(
    JSON.stringify({
      id: progressData.commandId,
      type: 'progress_update',
      message: {
        id: progressData.commandId,
        type: 'progress_update',
        data: progressData,
      },
    })
  );
}

/* ---------- 11. Misc utilities ---------- */

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function uint8ToPngDataUrlSync(u8Arr: Uint8Array): string {
  const CHUNK = 0x8000; // 32 KB
  let binary = '';
  for (let i = 0; i < u8Arr.length; i += CHUNK) {
    const slice = u8Arr.subarray(i, Math.min(i + CHUNK, u8Arr.length));
    binary += String.fromCharCode(...slice);
  }
  return window.btoa(binary); // if you need the full data-URL, prepend 'data:image/png;base64,'
}

/* ---------- 12. UI Event Wiring ---------- */

channelSelect.addEventListener('change', () => {
  UIstate.currentChannel = channelSelect.value;
  joinChannel();
});

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    tabContents.forEach((c) => c.classList.remove('active'));
    tab.classList.add('active');
    const contentId = `content-${tab.id.split('-')[1]}`;
    document.getElementById(contentId)?.classList.add('active');
  });
});

btnClearLogs.addEventListener('click', clearLogs);
btnClearLogsTab.addEventListener('click', clearLogs);

connectButton.addEventListener('click', () => {
  const port = Number.parseInt(portInput.value, 10) || 3055;
  updateConnectionStatus(false, 'Connecting…');
  connectionStatus.className = 'status info';
  connectToServer(port);
});

disconnectButton.addEventListener('click', () => {
  updateConnectionStatus(false, 'Disconnecting…');
  connectionStatus.className = 'status info';
  disconnectFromServer();
});

function clearLogs(): void {
  UIstate.logs.length = 0;
  logPanel.innerHTML = '';
  logPanelTab.innerHTML = '';

  parent.postMessage({ pluginMessage: { type: 'clear-logs' } }, '*');
}

/* ---------- 13. Bridge to Figma plugin ---------- */

window.onmessage = (evt: MessageEvent) => {
  const msg = (evt.data as any).pluginMessage;
  if (!msg) return;

  console.log('Received message from plugin:', msg);

  switch (msg.type) {
    case 'connection-status':
      updateConnectionStatus(msg.connected, msg.message);
      break;
    case 'auto-connect':
      connectButton.click();
      break;
    case 'auto-disconnect':
      disconnectButton.click();
      break;
    case 'command-result':
      sendSuccessResponse(msg.id, msg.result);
      break;
    case 'command-error':
      sendErrorResponse(msg.id, msg.error);
      break;
    case 'command_progress':
      updateProgressUI(msg);
      sendProgressUpdateToServer(msg);
      break;
  }
};

/* ---------- 14. Patch WebSocket.send for logging ---------- */

const originalSend = WebSocket.prototype.send;
WebSocket.prototype.send = function patchedSend(
  this: WebSocket,
  data: string | ArrayBufferLike | Blob | ArrayBufferView
): void {
  addLogEntry({
    timestamp: new Date().toISOString(),
    direction: 'outgoing',
    type: 'websocket',
    data,
  });
  // @ts-expect-error -- apply needs correct overload
  originalSend.apply(this, arguments);
};
