import { handleCommand } from './engine/handlers';

const state = { serverPort: 3055 };

figma.showUI(__html__, { width: 350, height: 700 });

const sendInitSettings = () => {
  figma.ui.postMessage({
    type: 'init-settings',
    settings: { serverPort: state.serverPort },
  });
};

const saveSettings = async (settings: { serverPort?: number }) => {
  if (settings.serverPort) state.serverPort = settings.serverPort;
  await figma.clientStorage.setAsync('settings', {
    serverPort: state.serverPort,
  });
};

figma.ui.onmessage = async (msg) => {
  switch (msg.type) {
    case 'update-settings':
      await saveSettings(msg);
      break;
    case 'notify':
      figma.notify(msg.message);
      break;
    case 'close-plugin':
      figma.closePlugin();
      break;
    case 'execute-command':
      try {
        const result = await handleCommand(msg.command, msg.params);
        figma.ui.postMessage({ type: 'command-result', id: msg.id, result });
      } catch (error) {
        figma.ui.postMessage({
          type: 'command-error',
          id: msg.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      break;
  }
};

figma.on('run', () => {
  figma.ui.postMessage({ type: 'auto-connect' });
});

(async () => {
  try {
    const savedSettings = await figma.clientStorage.getAsync('settings');
    if (savedSettings?.serverPort) state.serverPort = savedSettings.serverPort;
    sendInitSettings();
  } catch (error) {
    console.error('Error loading settings:', error);
  }
})();
