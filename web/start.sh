#!/bin/bash

# Continental Web - Quick Start Script

echo "🃏 Continental - Web Version"
echo "=================================="
echo ""
echo "Starting local web server on http://localhost:8000"
echo "Press Ctrl+C to stop the server"
echo ""

cd "$(dirname "$0")"

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed"
    echo "Please install Python 3 and try again"
    exit 1
fi

# Start the server
python3 -m http.server 8000
