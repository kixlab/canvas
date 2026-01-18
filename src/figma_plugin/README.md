# Figma Plugin

This document describes the structure of the Figma plugin for CanvasBench.

## Project Structure

```
src/
├── code.ts              # Main plugin entry point
├── script.ts            # UI script for plugin interface
├── ui.html              # Plugin UI interface
├── styles.css           # Plugin styling
├── manifest.json        # Figma plugin manifest
├── engine/
    ├── handlers.ts      # Command handling logic
    ├── figma-api.ts     # Figma API utilities
    ├── types.ts         # TypeScript type definitions
    ├── utils.ts         # Utility functions
    └── commands/        # Command implementations
        ├── annotationCommands.ts
        ├── componentCommands.ts
        ├── creationCommands.ts
        ├── inspectionCommands.ts
        ├── layoutCommands.ts
        ├── miscellaneousCommands.ts
        ├── operationCommands.ts
        ├── styleCommands.ts
        └── textCommands.ts
└── client/
    ├── ui.ts            # UI logic and handlers
    ├── websocket.ts     # Socket client
    ├── types.ts         # UI types
    └── utils.ts         # UI utilities
```

## Development

### Building

```bash
npm install
npm run build
```

### Loading in Figma

1. Open Figma Desktop
2. Go to Plugins → Development → Import plugin from manifest
3. Select the `dist/manifest.json` file
4. The plugin will be available in your Figma plugins

## Configuration

The plugin uses Vite for building.
