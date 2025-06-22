// Entry point for Figma plugin
import { handleCommand } from './code/handlers';

const internalState = {
  serverPort: 3055 as number,
};

figma.showUI(__html__, { width: 350, height: 700 });

figma.ui.onmessage = async (msg) => {
  switch (msg.type) {
    case 'update-settings':
      updateSettings(msg);
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
        figma.ui.postMessage({
          type: 'command-result',
          id: msg.id,
          result,
        });
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

figma.on('run', ({ command }) => {
  figma.ui.postMessage({ type: 'auto-connect' });
});

function updateSettings(settings: { serverPort?: number }) {
  if (settings.serverPort) {
    internalState.serverPort = settings.serverPort;
  }
  figma.clientStorage.setAsync('settings', {
    serverPort: internalState.serverPort,
  });
}

(async function initializePlugin() {
  try {
    const savedSettings = await figma.clientStorage.getAsync('settings');
    if (savedSettings) {
      if (savedSettings.serverPort) {
        internalState.serverPort = savedSettings.serverPort;
      }
    }

    // Send initial settings to UI
    figma.ui.postMessage({
      type: 'init-settings',
      settings: {
        serverPort: internalState.serverPort,
      },
    });
  } catch (error) {
    console.error('Error loading settings:', error);
  }
})();
