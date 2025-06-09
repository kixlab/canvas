#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
print_status "Checking prerequisites..."

if ! command_exists node; then
    print_error "Node.js is not installed. Please install Node.js (v18+ recommended)"
    exit 1
fi

if ! command_exists npm; then
    print_error "npm is not installed. Please install npm"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_warning "Node.js version is less than 18. Some features may not work properly."
fi

print_success "Prerequisites check completed"

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

print_status "Project root: $PROJECT_ROOT"

# Setup MCP Server
print_status "Setting up MCP Server..."
cd "$PROJECT_ROOT/src/mcp_server"

if [ ! -f "package.json" ]; then
    print_error "MCP Server package.json not found"
    exit 1
fi

print_status "Installing MCP Server dependencies..."
npm install

if [ $? -ne 0 ]; then
    print_error "Failed to install MCP Server dependencies"
    exit 1
fi

print_status "Building MCP Server..."
npm run build

if [ $? -ne 0 ]; then
    print_error "Failed to build MCP Server"
    exit 1
fi

print_success "MCP Server setup completed"

# Setup Figma Plugin
print_status "Setting up Figma Plugin..."
cd "$PROJECT_ROOT/src/figma_plugin"

if [ ! -f "package.json" ]; then
    print_error "Figma Plugin package.json not found"
    exit 1
fi

print_status "Installing Figma Plugin dependencies..."
npm install

if [ $? -ne 0 ]; then
    print_error "Failed to install Figma Plugin dependencies"
    exit 1
fi

print_status "Building Figma Plugin..."
npm run build

if [ $? -ne 0 ]; then
    print_error "Failed to build Figma Plugin"
    exit 1
fi

print_success "Figma Plugin setup completed"

# Check if Bun is available for socket server
cd "$PROJECT_ROOT"

if command_exists bun; then
    print_success "Bun is available for socket server"
else
    print_warning "Bun is not installed. You'll need it to run the socket server."
    print_status "Install Bun with: curl -fsSL https://bun.sh/install | bash"
fi