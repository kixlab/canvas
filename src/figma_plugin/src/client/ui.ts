import { UIState, LogEntry, ProgressData } from './types.js';

const byId = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

export const portInput = byId<HTMLInputElement>('port');
export const connectButton = byId<HTMLButtonElement>('btn-connect');
export const disconnectButton = byId<HTMLButtonElement>('btn-disconnect');
export const connectionStatus = byId<HTMLElement>('connection-status');
export const logPanel = byId<HTMLElement>('log-panel');
export const logPanelTab = byId<HTMLElement>('log-panel-tab');
export const btnClearLogs = byId<HTMLButtonElement>('btn-clear-logs');
export const btnClearLogsTab = byId<HTMLButtonElement>('btn-clear-logs-tab');
export const channelSelect = byId<HTMLSelectElement>('channel-select');
export const progressContainer = byId<HTMLElement>('progress-container');
export const progressBar = byId<HTMLElement>('progress-bar');
export const progressMessage = byId<HTMLElement>('progress-message');
export const progressStatus = byId<HTMLElement>('progress-status');
export const progressPercentage = byId<HTMLElement>('progress-percentage');

export const tabs = Array.from(
  document.querySelectorAll<HTMLButtonElement>('.tab')
);
export const tabContents = Array.from(
  document.querySelectorAll<HTMLElement>('.tab-content')
);

const LOGGING_DEPTH = 5;
const LOGGING_STRING_LENGTH = 30;

export const UIstate: UIState = {
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

export function updateConnectionStatus(
  isConnected: boolean,
  message?: string
): void {
  UIstate.connected = isConnected;
  connectionStatus.textContent =
    message ??
    (isConnected ? 'Connected to server' : 'Not connected to server');
  connectionStatus.className = `status ${
    isConnected ? 'connected' : 'disconnected'
  }`;
  connectButton.disabled = isConnected;
  disconnectButton.disabled = !isConnected;
  portInput.disabled = isConnected;
}

export function updateChannelSelectUI(enabled: boolean): void {
  channelSelect.disabled = !enabled;

  if (!enabled || UIstate.channels.length === 0) {
    channelSelect.innerHTML = '<option value="">No channels available</option>';
    return;
  }

  channelSelect.innerHTML = '';
  UIstate.channels.forEach((channel) => {
    const option = document.createElement('option');
    option.value = channel;
    option.textContent = channel;
    if (channel === UIstate.currentChannel) option.selected = true;
    channelSelect.appendChild(option);
  });
}

export function addLogEntry(entry: LogEntry): void {
  UIstate.logs.push(entry);
  if (UIstate.logs.length > UIstate.maxLogs) UIstate.logs.shift();

  const timeString = new Date(entry.timestamp).toLocaleTimeString();
  const logEl = buildLogEntry(entry, timeString);

  logPanel.appendChild(logEl);
  logPanelTab.appendChild(logEl.cloneNode(true));
  logPanel.scrollTop = logPanel.scrollHeight;
  logPanelTab.scrollTop = logPanelTab.scrollHeight;
}

const buildLogEntry = (entry: LogEntry, timeString: string) => {
  const logEl = document.createElement('div');
  logEl.className = `log-entry ${entry.direction}`;

  const dirSpan = document.createElement('span');
  dirSpan.className = `log-direction ${entry.direction}`;
  dirSpan.textContent = entry.direction.substring(0, 3).toUpperCase();

  const timeSpan = document.createElement('span');
  timeSpan.className = 'timestamp';
  timeSpan.textContent = timeString;

  const contentSpan = document.createElement('div');
  contentSpan.innerHTML = `<strong>${entry.type}</strong>: ${formatLogData(
    entry.data
  )}`;

  logEl.append(dirSpan, ' ', timeSpan, ' - ', contentSpan);
  return logEl;
};

function formatLogData(data: unknown): string {
  if (data === undefined || data === null) return 'null';

  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return formatLogData(parsed);
    } catch {
      return data;
    }
  }

  if (typeof data === 'object') {
    const simplified = simplifyObject(data, LOGGING_DEPTH);
    return JSON.stringify(simplified, null, 2)
      .replace(/\n/g, '<br>')
      .replace(/ /g, '&nbsp;');
  }

  return String(data);
}

function simplifyObject(obj: unknown, maxDepth = 2, depth = 0): unknown {
  if (depth >= maxDepth) {
    if (Array.isArray(obj)) return `[Array(${obj.length})]`;
    if (obj && typeof obj === 'object') {
      return `{Object with ${Object.keys(obj).length} properties}`;
    }
  }

  if (typeof obj === 'string' && obj.length > LOGGING_STRING_LENGTH) {
    return obj.substring(0, LOGGING_STRING_LENGTH) + '...';
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => simplifyObject(item, maxDepth, depth + 1));
  }

  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      out[key] = simplifyObject(value, maxDepth, depth + 1);
    }
    return out;
  }

  return obj;
}

export function updateProgressUI(progressData: ProgressData): void {
  progressContainer.classList.remove('hidden');

  const progress = progressData.progress ?? 0;
  progressBar.style.width = `${progress}%`;
  progressPercentage.textContent = `${progress}%`;
  progressMessage.textContent = progressData.message ?? 'Operation in progress';

  const statusMap: Record<string, string> = {
    started: 'Started',
    in_progress: 'In Progress',
    completed: 'Completed',
    error: 'Error',
  };

  progressStatus.textContent = statusMap[progressData.status] ?? 'In Progress';
  progressStatus.className =
    progressData.status === 'completed'
      ? 'operation-complete'
      : progressData.status === 'error'
      ? 'operation-error'
      : '';

  if (progressData.status === 'completed') {
    setTimeout(() => progressContainer.classList.add('hidden'), 5_000);
  }
}

export function clearLogs(): void {
  UIstate.logs.length = 0;
  logPanel.innerHTML = '';
  logPanelTab.innerHTML = '';
  parent.postMessage({ pluginMessage: { type: 'clear-logs' } }, '*');
}
