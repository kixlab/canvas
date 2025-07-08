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
} from './script/ui.js';
import {
  connectToServer,
  disconnectFromServer,
  joinChannel,
  sendSuccessResponse,
  sendErrorResponse,
  sendProgressUpdateToServer,
} from './script/websocket.js';
import { InternalFigmaMessageType } from './types.js';

/* ---------- UI Event Wiring ---------- */
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

/* ---------- Bridge to Figma plugin ---------- */
window.onmessage = (evt: MessageEvent) => {
  const msg = (evt.data as any).pluginMessage;
  if (!msg) return;

  console.log('Received message from plugin:', msg);

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

/* ---------- Patch WebSocket.send for logging ---------- */
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
