#!/bin/bash

# Kelly Assistant - Stop Script
# This script stops all components of the Kelly Assistant system

echo "🛑 Stopping Kelly Assistant..."

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to stop a service
stop_service() {
    local name=$1
    local pidfile="logs/${name}.pid"
    
    if [ -f "$pidfile" ]; then
        PID=$(cat "$pidfile")
        if kill -0 "$PID" 2>/dev/null; then
            echo "Stopping $name (PID: $PID)..."
            kill "$PID"
            rm "$pidfile"
            echo -e "${GREEN}✓ $name stopped${NC}"
        else
            echo "$name not running (stale PID file)"
            rm "$pidfile"
        fi
    else
        echo "$name not running"
    fi
}

# Stop all services
stop_service "backend"
stop_service "ipad"
stop_service "local-agent"

# Kill any remaining Node.js processes from our project
pkill -f "tsx watch src/server.ts" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
pkill -f "tsx watch src/index.ts" 2>/dev/null || true

echo -e "${GREEN}✓ All services stopped${NC}"