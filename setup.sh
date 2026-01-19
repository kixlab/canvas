#!/bin/bash

set -e

echo "=========================================="
echo "CANVAS Benchmark Setup Script"
echo "=========================================="
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if conda is installed
if ! command -v conda &> /dev/null; then
    print_error "Conda is not installed. Please install Miniconda or Anaconda first."
    print_info "Visit: https://docs.conda.io/en/latest/miniconda.html"
    exit 1
fi

# Check if node is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js v18.20.8 or later."
    print_info "Visit: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_warn "Node.js version is less than 18. Recommended: v18.20.8"
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm."
    exit 1
fi

print_info "Prerequisites check passed!"
echo ""

# Step 1: Create conda environment
print_info "Step 1: Creating Python conda environment..."
if conda env list | grep -q "^canvasbench "; then
    print_warn "Conda environment 'canvasbench' already exists."
    read -p "Do you want to recreate it? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        conda env remove -n canvasbench -y
        conda env create -f src/environment.yml
    else
        print_info "Skipping conda environment creation."
    fi
else
    conda env create -f src/environment.yml
fi
print_info "Conda environment created successfully!"
echo ""

# Step 2: Install Node.js dependencies
print_info "Step 2: Installing Node.js dependencies..."

# Socket Server
print_info "Installing dependencies for socket_server..."
cd src/socket_server
npm install
npm run build
cd ../..

# Figma Plugin
print_info "Installing dependencies for figma_plugin..."
cd src/figma_plugin
npm install
npm run build
cd ../..

# MCP Server
print_info "Installing dependencies for mcp_server..."
cd src/mcp_server
npm install
npm run build
cd ../..

# MCP Client
print_info "Installing dependencies for mcp_client..."
cd src/mcp_client
npm install
print_info "Installing Chrome for Puppeteer..."
npx puppeteer browsers install chrome
cd ../..

print_info "Node.js dependencies installed successfully!"
echo ""

# Step 3: Create .env template
print_info "Step 3: Creating .env template file..."
if [ -f .env ]; then
    print_warn ".env file already exists. Skipping template creation."
else
    cat > .env << 'EOF'
# OpenAI API Key (for gpt-4o, gpt-4.1)
OPENAI_API_KEY=your_openai_key_here

# Google Cloud API Key (for gemini-2.5-flash, gemini-2.5-pro)
GOOGLE_API_KEY=your_google_api_key_here
GOOGLE_APPLICATION_CREDENTIALS=path/to/your/google/credentials.json

# Amazon Bedrock (for claude-3-5-sonnet)
# Install boto3 and awscli: pip install boto3 awscli
AWS_REGION=us-east-1
BEDROCK_ACCESS_KEY=your_aws_access_key_here
BEDROCK_SECRET_KEY=your_aws_secret_key_here

# Ollama (for local models)
# OLLAMA_BASE_URL=http://localhost:11434
EOF
    print_info ".env template file created!"
    print_warn "Please edit .env file and add your API keys before running experiments."
fi
echo ""

# Step 4: Summary
print_info "=========================================="
print_info "Setup completed successfully!"
print_info "=========================================="
echo ""
print_info "Next steps:"
echo "  1. Edit .env file and add your API keys"
echo "  2. Activate conda environment: conda activate canvasbench"
echo "  3. Start the services:"
echo "     - Terminal 1: cd src/socket_server && npm run dev"
echo "     - Terminal 2: cd src/mcp_client && npm run dev -- --port=3001"
echo "  4. Load Figma Plugin:"
echo "     - Open Figma Desktop"
echo "     - Go to: Figma logo → Plugins → Development"
echo "     - Load manifest: src/figma_plugin/dist/manifest.json"
echo "     - Click Connect"
echo ""
print_info "For more details, see README.md"
echo ""
