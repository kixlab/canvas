# Socket Server

This document describes the Socket Server component that provides WebSocket-based communication for the CanvasBench.

## File Structure

- **[`socket.ts`](socket.ts)** - Main WebSocket server implementation

## Overview

The Socket Server provides real-time communication between the MCP server and the Figma plugin via WebSocket channels.

## Usage

Install dependencies:

```bash
npm install
```

Build the server:

```bash
npm run build
```

Run the socket server:

```bash
npm start
```

## Defaults

- WebSocket server port: `3055`
- Channels: `1-A` through `10-J`

## Protocol Notes

- Clients request channels via `get_channels`, then join with `join`.
- Messages are broadcast within a channel via `message` and relayed as `transmit`.
