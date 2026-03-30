#!/bin/bash
# hf-mount setup script
# Usage: ./setup.sh

set -e

echo "🤗 hf-mount Setup Script"
echo "========================"

# Check if hf-mount is installed
if ! command -v hf-mount &> /dev/null; then
    echo "📦 Installing hf-mount..."
    curl -fsSL https://raw.githubusercontent.com/huggingface/hf-mount/main/install.sh | sh
    echo "✅ hf-mount installed"
else
    echo "✅ hf-mount already installed"
fi

# Check if model is mounted
if mountpoint -q /tmp/gpt2 2>/dev/null || [ -f /tmp/gpt2/config.json ]; then
    echo "✅ Model already mounted at /tmp/gpt2"
else
    echo "📥 Mounting gpt2 model..."
    hf-mount start repo openai-community/gpt2 /tmp/gpt2
    echo "✅ Model mounted"
fi

# Check Python dependencies
echo "📋 Checking Python dependencies..."
pip install -q flask transformers torch

echo ""
echo "🚀 Starting API server..."
echo "   Then open: http://localhost:5000"
echo ""

python3 api_server.py
