#!/bin/bash

# Get script directory and navigate to socket server
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(dirname "$SCRIPT_DIR")/src/socket_server"

# Check if directory exists
if [ ! -d "." ]; then
    echo "Error: Socket server directory not found"
    exit 1
fi

# Install dependencies if needed
[ ! -d "node_modules" ] && npm install

# Build if needed
[ ! -d "dist" ] && npm run build

# Start server
echo "Starting Socket Server..."
npm run start