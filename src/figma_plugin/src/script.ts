import {
  UIstate,
  updateConnectionStatus,
  updateProgressUI,
  clearLogs,
  addLogEntry,
  portInput,
  connectButton,
  disconnectButton,
  connectionStatus,
  channelSelect,
  tabs,
  tabContents,
  btnClearLogs,
  btnClearLogsTab,
} from './client/ui.js';
import {
  connectToServer,
  disconnectFromServer,
  joinChannel,
  sendSuccessResponse,
  sendErrorResponse,
  sendProgressUpdateToServer,
} from './client/websocket.js';
import { InternalFigmaMessageType } from './types.js';

const setStatus = (connected: boolean, message: string, className = 'status') => {
  updateConnectionStatus(connected, message);
  connectionStatus.className = className;
};

const setActiveTab = (activeTab: HTMLElement) => {
  tabs.forEach((tab) => tab.classList.remove('active'));
  tabContents.forEach((content) => content.classList.remove('active'));
  activeTab.classList.add('active');
  const contentId = `content-${activeTab.id.split('-')[1]}`;
  document.getElementById(contentId)?.classList.add('active');
};

channelSelect.addEventListener('change', () => {
  UIstate.currentChannel = channelSelect.value;
  joinChannel();
});

tabs.forEach((tab) => {
  tab.addEventListener('click', () => setActiveTab(tab));
});

btnClearLogs.addEventListener('click', clearLogs);
btnClearLogsTab.addEventListener('click', clearLogs);

connectButton.addEventListener('click', () => {
  const port = Number.parseInt(portInput.value, 10) || 3055;
  setStatus(false, 'Connecting…', 'status info');
  connectToServer(port);
});

disconnectButton.addEventListener('click', () => {
  setStatus(false, 'Disconnecting…', 'status info');
  disconnectFromServer();
});

window.onmessage = (evt: MessageEvent) => {
  const msg = (evt.data as any)?.pluginMessage;
  if (!msg) return;

  switch (msg.type) {
    case InternalFigmaMessageType.UPDATE_SETTINGS:
      updateConnectionStatus(msg.connected, msg.message);
      break;
    case InternalFigmaMessageType.AUTO_CONNECT:
      connectButton.click();
      break;
    case InternalFigmaMessageType.AUTO_DISCONNECT:
      disconnectButton.click();
      break;
    case InternalFigmaMessageType.COMMAND_RESULT:
      sendSuccessResponse(msg.id, msg.result);
      break;
    case InternalFigmaMessageType.COMMAND_ERROR:
      sendErrorResponse(msg.id, msg.error);
      break;
    case InternalFigmaMessageType.COMMAND_PROGRESS:
      updateProgressUI(msg);
      sendProgressUpdateToServer(msg);
      break;
  }
};

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
  originalSend.call(this, data as any);
};
