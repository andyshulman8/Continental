#!/bin/bash
# Start Continental game server

cd "$(dirname "$0")"

# Set default port
PORT=${PORT:-8080}

# Build the server
echo "Building Continental game server..."
go build -o continental-server ./cmd/server

if [ $? -ne 0 ]; then
    echo "Build failed!"
    exit 1
fi

# Start the server
echo "Starting Continental game server on port $PORT..."
./continental-server -port $PORT
