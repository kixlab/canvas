import { UIState, LogEntry, ProgressData } from './types.js';

/* ---------- DOM Elements ---------- */
export const portInput = document.getElementById('port') as HTMLInputElement;
export const connectButton = document.getElementById(
  'btn-connect'
) as HTMLButtonElement;
export const disconnectButton = document.getElementById(
  'btn-disconnect'
) as HTMLButtonElement;
export const connectionStatus = document.getElementById(
  'connection-status'
) as HTMLElement;
export const logPanel = document.getElementById('log-panel') as HTMLElement;
export const logPanelTab = document.getElementById(
  'log-panel-tab'
) as HTMLElement;
export const btnClearLogs = document.getElementById(
  'btn-clear-logs'
) as HTMLButtonElement;
export const btnClearLogsTab = document.getElementById(
  'btn-clear-logs-tab'
) as HTMLButtonElement;
export const channelSelect = document.getElementById(
  'channel-select'
) as HTMLSelectElement;

/* Tabs */
export const tabs = document.querySelectorAll<HTMLButtonElement>('.tab');
export const tabContents =
  document.querySelectorAll<HTMLElement>('.tab-content');

/* Progress elements */
export const progressContainer = document.getElementById(
  'progress-container'
) as HTMLElement;
export const progressBar = document.getElementById(
  'progress-bar'
) as HTMLElement;
export const progressMessage = document.getElementById(
  'progress-message'
) as HTMLElement;
export const progressStatus = document.getElementById(
  'progress-status'
) as HTMLElement;
export const progressPercentage = document.getElementById(
  'progress-percentage'
) as HTMLElement;

const LOGGING_DEPTH = 5;
const LOGGING_STRING_LENGTH = 30;

/* ---------- Application State ---------- */
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

/* ---------- UI State Helpers ---------- */
export function updateConnectionStatus(
  isConnected: boolean,
  message?: string
): void {
  UIstate.connected = isConnected;

  connectionStatus.textContent =
    message ??
    (isConnected ? 'Connected to server' : 'Not connected to server');
  connectionStatus.className = `status ${isConnected ? 'connected' : 'disconnected'}`;

  connectButton.disabled = isConnected;
  disconnectButton.disabled = !isConnected;
  portInput.disabled = isConnected;
}

/* ---------- Channel Management UI ---------- */
export function updateChannelSelectUI(enabled: boolean): void {
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

/* ---------- Logging UI ---------- */
export function addLogEntry(entry: LogEntry): void {
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
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      const simplified = simplifyObject(parsed, LOGGING_DEPTH);
      return JSON.stringify(simplified, null, 2)
        .replace(/\n/g, '<br>')
        .replace(/ /g, '&nbsp;');
    } catch {
      return data;
    }
  }

  if (typeof data === 'object') {
    try {
      const simplified = simplifyObject(data, LOGGING_DEPTH);
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
  }

  if (typeof obj === 'string' && obj.length > LOGGING_STRING_LENGTH) {
    return obj.substring(0, LOGGING_STRING_LENGTH) + '...';
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

/* ---------- Progress UI ---------- */
export function updateProgressUI(progressData: ProgressData): void {
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

/* ---------- Clear Logs Function ---------- */
export function clearLogs(): void {
  UIstate.logs.length = 0;
  logPanel.innerHTML = '';
  logPanelTab.innerHTML = '';

  parent.postMessage({ pluginMessage: { type: 'clear-logs' } }, '*');
}
